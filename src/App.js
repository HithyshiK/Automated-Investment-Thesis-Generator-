import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [extractedText, setExtractedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) {
      alert('Please select a file to upload.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('http://localhost:5000/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      console.log('File uploaded successfully:', response.data);
      setExtractedText(response.data.text);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error uploading file. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const [thesis, setThesis] = useState('');

  const handleAnalysis = async () => {
    if (!extractedText) {
      alert('Please extract text from a file first.');
      return;
    }

    try {
      const response = await axios.post('http://localhost:5000/analyze', { text: extractedText });
      setDownloadUrl(response.data.downloadUrl);
      // The thesis text is not returned directly now; the PDF can be downloaded
    } catch (error) {
      console.error('Error analyzing text:', error);
      alert('Error analyzing text. Please try again.');
    }
  };

  const handleDownloadPDF = () => {
    if (!downloadUrl) {
      alert('No report available. Please run analysis first.');
      return;
    }
    window.open(downloadUrl, '_blank');
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Automated Investment Thesis Generator</h1>
        <p>Upload a startup pitch deck (PPT/PPTX) to get started.</p>
        <input type="file" onChange={handleFileChange} accept=".ppt, .pptx" />
        <button onClick={handleUpload} disabled={loading}>
          {loading ? 'Uploading...' : 'Upload'}
        </button>
        {loading && <p>Loading...</p>}
        {extractedText && (
          <div className="extracted-text">
            <h2>Extracted Text:</h2>
            <p>{extractedText}</p>
            <button onClick={handleAnalysis}>Analyze</button>
          </div>
        )}
        {downloadUrl && (
          <div className="thesis">
            <h2>Analysis Complete</h2>
            <p>Your report is ready.</p>
            <button onClick={handleDownloadPDF}>Download PDF</button>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
