# setup_and_run.py
import os
import subprocess
import sys

def install_requirements():
    """Install required packages"""
    try:
        print("Installing required packages...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("✅ All packages installed successfully!")
    except subprocess.CalledProcessError as e:
        print(f"❌ Error installing packages: {e}")
        sys.exit(1)

def check_env_file():
    """Check if .env file exists and has required keys"""
    if not os.path.exists('.env'):
        print("❌ .env file not found!")
        print("📝 Please create a .env file with the following variables:")
        print("PINECONE_API_KEY=your_pinecone_api_key_here")
        print("GENAI_API_KEY=your_google_generative_ai_api_key_here")
        return False
    
    with open('.env', 'r') as f:
        content = f.read()
    
    if 'PINECONE_API_KEY=' not in content or 'GENAI_API_KEY=' not in content:
        print("❌ Required API keys not found in .env file!")
        print("📝 Make sure your .env file contains:")
        print("PINECONE_API_KEY=your_pinecone_api_key_here")
        print("GENAI_API_KEY=your_google_generative_ai_api_key_here")
        return False
    
    print("✅ .env file looks good!")
    return True

def check_data_folder():
    """Check if data folder exists"""
    if not os.path.exists('data'):
        print("⚠️  'data' folder not found. Creating one...")
        os.makedirs('data')
        print("📁 Please add your PDF files to the 'data' folder")
        return False
    
    pdf_files = [f for f in os.listdir('data') if f.endswith('.pdf')]
    if not pdf_files:
        print("⚠️  No PDF files found in 'data' folder")
        print("📁 Please add your PDF files to the 'data' folder")
        return False
    
    print(f"✅ Found {len(pdf_files)} PDF files in data folder")
    return True

def run_server():
    """Run the Flask server"""
    try:
        print("🚀 Starting Farmer's Assistant API Server...")
        print("🌐 Server will be available at: http://localhost:5000")
        print("💬 Chat endpoint: http://localhost:5000/api/chat")
        print("🔍 Health check: http://localhost:5000/api/health")
        print("ℹ️  Info endpoint: http://localhost:5000/api/info")
        print("-" * 50)
        
        # Import and run the Flask app
        from app import app
        app.run(debug=True, host='0.0.0.0', port=5000)
        
    except ImportError as e:
        print(f"❌ Error importing Flask app: {e}")
        print("Make sure app.py is in the same directory")
    except Exception as e:
        print(f"❌ Error starting server: {e}")

def main():
    """Main setup and run function"""
    print("🌾 Farmer's Assistant Chatbot Setup")
    print("=" * 40)
    
    # Step 1: Install requirements
    if not os.path.exists('requirements.txt'):
        print("❌ requirements.txt not found!")
        sys.exit(1)
    
    install_requirements()
    
    # Step 2: Check environment file
    if not check_env_file():
        print("\n🛑 Please fix the .env file issues and run again.")
        sys.exit(1)
    
    # Step 3: Check data folder
    has_data = check_data_folder()
    if not has_data:
        print("\n⚠️  You can still run the server, but responses will be limited without PDF data.")
        response = input("Do you want to continue? (y/n): ").lower()
        if response != 'y':
            print("👋 Setup cancelled. Please add PDF files and run again.")
            sys.exit(0)
    
    # Step 4: Run server
    print("\n✅ Setup completed! Starting server...")
    run_server()

if __name__ == "__main__":
    main()