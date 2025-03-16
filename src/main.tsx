import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// MetaMask için window.ethereum tipini tanımla
declare global {
  interface Window {
    ethereum?: any;
  }
}

// Handle the "Cannot delete property 'dispose'" error
const handleLockdownError = () => {
  // This error comes from MetaMask's lockdown feature
  // It's not harmful to the application functionality
  window.addEventListener('error', (event) => {
    // Check for the specific error message
    if (
      event.message?.includes("Cannot delete property 'dispose'") ||
      event.error?.toString().includes("Cannot delete property 'dispose'")
    ) {
      console.warn('MetaMask lockdown error detected but application will continue to work');
      event.preventDefault();
      return true;
    }
    
    // Also handle orphaned data stream errors from MetaMask
    if (
      event.message?.includes("ObjectMultiplex - orphaned data") ||
      event.error?.toString().includes("ObjectMultiplex - orphaned data")
    ) {
      console.warn('MetaMask stream error detected but application will continue to work');
      event.preventDefault();
      return true;
    }
    
    return false;
  });
  
  // Also handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    if (
      event.reason?.toString().includes("Cannot delete property 'dispose'") ||
      event.reason?.toString().includes("ObjectMultiplex - orphaned data")
    ) {
      console.warn('MetaMask error in promise detected but application will continue to work');
      event.preventDefault();
      return true;
    }
    return false;
  });
};

// Call the error handler
handleLockdownError();

// Create a custom error boundary component
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Application error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '20px', 
          margin: '20px', 
          backgroundColor: '#ffebee', 
          border: '1px solid #f44336',
          borderRadius: '4px'
        }}>
          <h2>Something went wrong</h2>
          <p>The application encountered an error. Please try refreshing the page.</p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#f44336',
              color: 'white',
              padding: '10px 15px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginTop: '10px'
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
