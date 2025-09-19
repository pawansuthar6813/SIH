from langchain.document_loaders import PyPDFLoader, DirectoryLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from dotenv import load_dotenv
import os
def load_pdf_files(data):
    loader = DirectoryLoader(
        data,
        glob="*.pdf",
        loader_cls=PyPDFLoader
    )

    documents = loader.load()
    return documents

extracted_data = load_pdf_files("data")


from typing import List
from langchain.schema import Document

def filter_to_minimal_docs(docs: List[Document]) -> List[Document]:
    """
    Given a list of Document objects, return a new list of Document objects
    containing only 'source' in metadata and the original page_content.
    """
    minimal_docs: List[Document] = []
    for doc in docs:
        src = doc.metadata.get("source")
        minimal_docs.append(
            Document(
                page_content=doc.page_content,
                metadata={"source": src}
            )
        )
    return minimal_docs

minimal_docs = filter_to_minimal_docs(extracted_data)

def text_split(minimal_docs):
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=20,
    )
    texts_chunk = text_splitter.split_documents(minimal_docs)
    return texts_chunk

from langchain.text_splitter import RecursiveCharacterTextSplitter
texts_chunk = text_split(minimal_docs)
print(f"Number of chunks: {len(texts_chunk)}")

from langchain.embeddings import HuggingFaceEmbeddings

def download_embeddings():
    """
    Download and return the HuggingFace embeddings model.
    """
    model_name = "sentence-transformers/all-MiniLM-L6-v2"
    embeddings = HuggingFaceEmbeddings(
        model_name=model_name
    )
    return embeddings

embedding = download_embeddings()

PINECONE_API_KEY="pcsk_4k2mTb_8UwJNXduEcbf9jav3Qrziy2Xp7LB5fy3TgAAXGB3RfRYZzfqivmY9wUgkUurBBt"
GENAI_API_KEY="AIzaSyD1nY3b0r5vU4eX8F7Qz3b8F9vX9F7Qz3b8F9vX9F7Q"

from pinecone import Pinecone 
pinecone_api_key = PINECONE_API_KEY

pc = Pinecone(api_key=pinecone_api_key)

from pinecone import ServerlessSpec 

index_name = "general-query"

if not pc.has_index(index_name):
    pc.create_index(
        name = index_name,
        dimension=384,  # Dimension of the embeddings
        metric= "cosine",  # Cosine similarity
        spec=ServerlessSpec(cloud="aws", region="us-east-1")
    )


index = pc.Index(index_name)

from langchain_pinecone import PineconeVectorStore

docsearch = PineconeVectorStore.from_documents(
    documents=texts_chunk,
    embedding=embedding,
    index_name=index_name
)
import os
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
GENAI_API_KEY=os.getenv("GENAI_API_KEY")


os.environ["PINECONE_API_KEY"] = PINECONE_API_KEY
os.environ["GENAI_API_KEY"] = GENAI_API_KEY

from langchain_pinecone import PineconeVectorStore
# Embed each chunk and upsert the embeddings into your Pinecone index.
docsearch = PineconeVectorStore.from_existing_index(
    index_name=index_name,
    embedding=embedding
)

dswith = Document(
    page_content="This platform namely Kisaan Shayak is an end-to-end Farmer's AI assistant to solve all their queries related to agriculture and farming practices in INDIA.",
    metadata={"source": "dev_aryan"}
)

retriever = docsearch.as_retriever(search_type="similarity", search_kwargs={"k":3})
retrieved_docs = retriever.invoke("What is Organic Farming?")
GENAI_API_KEY = os.getenv("GENAI_API_KEY")


from langchain_google_genai import GoogleGenerativeAI

# Set your actual API key here if not loaded from .env
GENAI_API_KEY = "AIzaSyB81OaoQVmlmzPee9qo2N4NE8V6iCEJ9ZE"

llm = GoogleGenerativeAI(model="gemini-2.5-pro", google_api_key=GENAI_API_KEY)




from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate

system_prompt = (
    "You are a Farmer's Assistant chatbot for question-answering tasks. "
    "Use the following pieces of retrieved context to answer "
    "the question. If you don't know the answer, say that you "
    "don't know. Use three to four sentences maximum and keep the "
    "answer concise."
    "\n\n"
    "{context}"
)


prompt = ChatPromptTemplate.from_messages(
    [
        ("system", system_prompt),
        ("human", "{input}"),
    ]
)


question_answer_chain = create_stuff_documents_chain(llm, prompt)
rag_chain = create_retrieval_chain(retriever, question_answer_chain)

response = rag_chain.invoke({"input": "What fertilizers can be used in a maize crop?"})
print(response["answer"])