# app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from langchain.document_loaders import PyPDFLoader, DirectoryLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.embeddings import HuggingFaceEmbeddings
from langchain_pinecone import PineconeVectorStore
from langchain_google_genai import GoogleGenerativeAI
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate
from langchain.schema import Document
from pinecone import Pinecone, ServerlessSpec
from dotenv import load_dotenv
import os
from typing import List
import logging

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend connection

class FarmerAssistantRAG:
    def __init__(self):
        self.embedding = None
        self.retriever = None
        self.rag_chain = None
        self.setup_rag_system()
    
    def load_pdf_files(self, data_path):
        """Load PDF files from directory"""
        try:
            loader = DirectoryLoader(
                data_path,
                glob="*.pdf",
                loader_cls=PyPDFLoader
            )
            documents = loader.load()
            logger.info(f"Loaded {len(documents)} documents from {data_path}")
            return documents
        except Exception as e:
            logger.error(f"Error loading PDF files: {e}")
            return []
    
    def filter_to_minimal_docs(self, docs: List[Document]) -> List[Document]:
        """Filter documents to keep only essential metadata"""
        minimal_docs = []
        for doc in docs:
            src = doc.metadata.get("source", "unknown")
            minimal_docs.append(
                Document(
                    page_content=doc.page_content,
                    metadata={"source": src}
                )
            )
        return minimal_docs
    
    def text_split(self, docs):
        """Split documents into chunks"""
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=20,
        )
        chunks = text_splitter.split_documents(docs)
        logger.info(f"Created {len(chunks)} text chunks")
        return chunks
    
    def setup_embeddings(self):
        """Setup HuggingFace embeddings"""
        try:
            model_name = "sentence-transformers/all-MiniLM-L6-v2"
            self.embedding = HuggingFaceEmbeddings(model_name=model_name)
            logger.info("Embeddings model loaded successfully")
        except Exception as e:
            logger.error(f"Error loading embeddings: {e}")
            raise e
    
    def setup_pinecone(self):
        """Setup Pinecone vector database"""
        try:
            # Get API keys from environment
            pinecone_api_key = os.getenv("PINECONE_API_KEY")
            if not pinecone_api_key:
                raise ValueError("PINECONE_API_KEY not found in environment variables")
            
            pc = Pinecone(api_key=pinecone_api_key)
            index_name = "general-query"
            
            # Create index if it doesn't exist
            if not pc.has_index(index_name):
                pc.create_index(
                    name=index_name,
                    dimension=384,
                    metric="cosine",
                    spec=ServerlessSpec(cloud="aws", region="us-east-1")
                )
                logger.info(f"Created new Pinecone index: {index_name}")
            
            # Setup retriever
            docsearch = PineconeVectorStore.from_existing_index(
                index_name=index_name,
                embedding=self.embedding
            )
            
            self.retriever = docsearch.as_retriever(
                search_type="similarity", 
                search_kwargs={"k": 3}
            )
            logger.info("Pinecone setup completed successfully")
            
        except Exception as e:
            logger.error(f"Error setting up Pinecone: {e}")
            raise e
    
    def setup_llm_and_chain(self):
        """Setup LLM and RAG chain"""
        try:
            genai_api_key = os.getenv("GENAI_API_KEY")
            if not genai_api_key:
                raise ValueError("GENAI_API_KEY not found in environment variables")
            
            # Initialize Google Generative AI
            llm = GoogleGenerativeAI(
                model="gemini-2.5-pro", 
                google_api_key=genai_api_key
            )
            
            # Create prompt template
            system_prompt = (
                "You are a Farmer's Assistant chatbot for question-answering tasks. "
                "Use the following pieces of retrieved context to answer "
                "the question. If you don't know the answer, say that you "
                "don't know. Use three to four sentences maximum and keep the "
                "answer concise. Always be helpful and provide practical farming advice."
                "\n\n"
                "{context}"
            )
            
            prompt = ChatPromptTemplate.from_messages([
                ("system", system_prompt),
                ("human", "{input}"),
            ])
            
            # Create RAG chain
            question_answer_chain = create_stuff_documents_chain(llm, prompt)
            self.rag_chain = create_retrieval_chain(self.retriever, question_answer_chain)
            
            logger.info("RAG chain setup completed successfully")
            
        except Exception as e:
            logger.error(f"Error setting up LLM and chain: {e}")
            raise e
    
    def setup_rag_system(self):
        """Initialize the complete RAG system"""
        try:
            logger.info("Starting RAG system setup...")
            
            # Setup embeddings
            self.setup_embeddings()
            
            # Setup Pinecone (assuming data is already indexed)
            self.setup_pinecone()
            
            # Setup LLM and chain
            self.setup_llm_and_chain()
            
            logger.info("RAG system setup completed successfully!")
            
        except Exception as e:
            logger.error(f"Failed to setup RAG system: {e}")
            raise e
    
    def get_response(self, query):
        """Get response from RAG chain"""
        try:
            if not self.rag_chain:
                return "RAG system not initialized properly."
            
            response = self.rag_chain.invoke({"input": query})
            return response["answer"]
            
        except Exception as e:
            logger.error(f"Error getting response: {e}")
            return "Sorry, I encountered an error while processing your question. Please try again."

# Initialize RAG system
try:
    farmer_assistant = FarmerAssistantRAG()
except Exception as e:
    logger.error(f"Failed to initialize Farmer Assistant: {e}")
    farmer_assistant = None

@app.route('/api/chat', methods=['POST'])
def chat():
    """Main chat endpoint"""
    try:
        data = request.get_json()
        
        if not data or 'message' not in data:
            return jsonify({'error': 'Message is required'}), 400
        
        user_message = data['message'].strip()
        
        if not user_message:
            return jsonify({'error': 'Message cannot be empty'}), 400
        
        # Check if RAG system is initialized
        if not farmer_assistant:
            return jsonify({
                'reply': 'Sorry, the AI system is currently unavailable. Please try again later.'
            }), 500
        
        # Get response from RAG system
        bot_response = farmer_assistant.get_response(user_message)
        
        return jsonify({
            'reply': bot_response,
            'status': 'success'
        })
        
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}")
        return jsonify({
            'reply': 'Sorry, I encountered an error. Please try again.',
            'status': 'error'
        }), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'rag_system': 'initialized' if farmer_assistant else 'not initialized'
    })

@app.route('/api/info', methods=['GET'])
def get_info():
    """Get information about the chatbot"""
    return jsonify({
        'name': 'Kisaan Shayak - Farmer\'s AI Assistant',
        'description': 'An end-to-end Farmer\'s AI assistant to solve all queries related to agriculture and farming practices in INDIA.',
        'capabilities': [
            'Crop recommendations',
            'Fertilizer guidance',
            'Pest management',
            'Weather-based advice',
            'Organic farming practices',
            'Soil management'
        ]
    })

# Route for testing data indexing (optional)
@app.route('/api/index-data', methods=['POST'])
def index_data():
    """Endpoint to index new PDF data (use with caution)"""
    try:
        data = request.get_json()
        data_path = data.get('data_path', 'data')
        
        if not os.path.exists(data_path):
            return jsonify({'error': f'Data path {data_path} does not exist'}), 400
        
        # Load and process documents
        documents = farmer_assistant.load_pdf_files(data_path)
        if not documents:
            return jsonify({'error': 'No documents found to index'}), 400
        
        minimal_docs = farmer_assistant.filter_to_minimal_docs(documents)
        chunks = farmer_assistant.text_split(minimal_docs)
        
        # Index to Pinecone
        docsearch = PineconeVectorStore.from_documents(
            documents=chunks,
            embedding=farmer_assistant.embedding,
            index_name="general-query"
        )
        
        return jsonify({
            'message': f'Successfully indexed {len(chunks)} chunks from {len(documents)} documents',
            'status': 'success'
        })
        
    except Exception as e:
        logger.error(f"Error indexing data: {e}")
        return jsonify({
            'error': 'Failed to index data',
            'status': 'error'
        }), 500

if __name__ == '__main__':
    print("Starting Farmer's Assistant API Server...")
    print("Make sure you have set the following environment variables:")
    print("- PINECONE_API_KEY")
    print("- GENAI_API_KEY")
    app.run(debug=True, host='0.0.0.0', port=5000)