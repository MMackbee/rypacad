import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { processDataImport, uploadDataToFirestore, dataTemplates } from '../services/dataService';
import { theme } from '../styles/theme';

const CSVUploader = ({ user, onUploadComplete }) => {
  const [vendor, setVendor] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [notes, setNotes] = useState('');
  const [elevation, setElevation] = useState(0);
  const [mappedData, setMappedData] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  const onDrop = (acceptedFiles) => {
    if (!acceptedFiles || acceptedFiles.length === 0) {
      setError('No file selected');
      return;
    }
    
    const file = acceptedFiles[0];
    if (!file || !vendor) {
      alert('Please select a vendor and drop a CSV file.');
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      error: (error) => {
        console.error('CSV parsing error:', error);
        setError(`❌ Error parsing CSV file: ${error.message}`);
      },
      complete: async (results) => {
        const rows = results.data;
        
        // Validate that we have data
        if (!rows || rows.length === 0) {
          setError('❌ CSV file appears to be empty or has no valid data.');
          return;
        }
        
        if (!rows[0] || Object.keys(rows[0]).length === 0) {
          setError('❌ CSV file has no valid headers or data structure.');
          return;
        }
        
        const headers = Object.keys(rows[0]);
        const template = dataTemplates[vendor];
        const templateKeys = Object.keys(template);

        // Validate header match
        const matches = templateKeys.filter(key => headers.includes(key));
        if (matches.length === 0) {
          setError(`❌ Your CSV doesn't match the expected format for "${vendor}". 
Make sure the file uses column headers like: ${templateKeys.join(', ')}`);
          return;
        }

        setError('');
        setUploading(true);

        try {
          // Process the data
          const processedData = await processDataImport(
            rows, 
            vendor, 
            sessionName, 
            notes, 
            elevation, 
            user
          );

          setMappedData(processedData);

          // Upload to Firestore
          await uploadDataToFirestore(processedData, setUploadProgress);

          if (onUploadComplete) {
            onUploadComplete(processedData);
          } else {
            alert(`Upload complete! ${processedData.length} rows saved.`);
          }
        } catch (err) {
          console.error('❌ Upload failed:', err);
          setError(`Upload failed: ${err.message}`);
          alert(`Upload failed: ${err.message}`);
        } finally {
          setUploading(false);
          setUploadProgress(0);
        }
      },
    });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: '.csv',
  });

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.xl,
    fontFamily: theme.typography.fontFamily.body,
    color: theme.colors.text.primary
  };

  const headerStyle = {
    textAlign: 'center',
    marginBottom: theme.spacing.xl
  };

  const titleStyle = {
    fontSize: theme.typography.fontSizes['2xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const subtitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const formStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.lg
  };

  const fieldStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm
  };

  const labelStyle = {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.text.primary,
    fontFamily: theme.typography.fontFamily.body
  };

  const inputStyle = {
    width: '100%',
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background.secondary,
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSizes.base,
    fontFamily: theme.typography.fontFamily.body,
    outline: 'none',
    transition: 'all 0.2s ease',
    ':focus': {
      borderColor: theme.colors.primary,
      boxShadow: `0 0 0 2px ${theme.colors.primary}20`
    }
  };

  const textareaStyle = {
    ...inputStyle,
    resize: 'none',
    minHeight: '80px'
  };

  const dropzoneStyle = {
    border: `2px dashed ${isDragActive ? theme.colors.primary : theme.colors.border}`,
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: isDragActive ? `${theme.colors.primary}10` : theme.colors.background.secondary,
    ':hover': {
      borderColor: theme.colors.primary,
      backgroundColor: `${theme.colors.primary}10`
    }
  };

  const uploadProgressStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    boxShadow: theme.shadows.md,
    border: `1px solid ${theme.colors.border}`
  };

  const progressBarStyle = {
    width: '100%',
    height: '8px',
    backgroundColor: theme.colors.border,
    borderRadius: '4px',
    overflow: 'hidden'
  };

  const progressFillStyle = {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: '4px',
    transition: 'width 0.3s ease-out',
    width: `${uploadProgress}%`
  };

  const errorStyle = {
    backgroundColor: `${theme.colors.error}20`,
    border: `1px solid ${theme.colors.error}`,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md
  };

  const errorTextStyle = {
    color: theme.colors.error,
    fontSize: theme.typography.fontSizes.sm,
    whiteSpace: 'pre-line'
  };

  const successStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`
  };

  const successTitleStyle = {
    color: theme.colors.success,
    fontWeight: theme.typography.fontWeights.bold,
    marginBottom: theme.spacing.md
  };

  const codeStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.success,
    overflowX: 'auto',
    fontSize: theme.typography.fontSizes.xs,
    border: `1px solid ${theme.colors.border}`,
    fontFamily: 'monospace'
  };

  const infoIconStyle = {
    color: theme.colors.primary,
    marginLeft: theme.spacing.xs
  };

  const spinnerStyle = {
    animation: 'spin 1s linear infinite',
    border: `2px solid ${theme.colors.border}`,
    borderTop: `2px solid ${theme.colors.primary}`,
    borderRadius: '50%',
    width: '24px',
    height: '24px'
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h3 style={titleStyle}>Upload Your CSV</h3>
        <p style={subtitleStyle}>Select your launch monitor and upload your session data</p>
      </div>

      <div style={formStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>
            Select Launch Monitor: <span style={infoIconStyle}>ⓘ</span>
          </label>
          <select
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            style={inputStyle}
          >
            <option value="">-- Choose Launch Monitor --</option>
            <option value="rapsodo">Rapsodo</option>
            <option value="gspro">GSPro</option>
            <option value="foresight">Foresight</option>
            <option value="trackman">Trackman</option>
          </select>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>
            Session Name: <span style={infoIconStyle}>ⓘ</span>
          </label>
          <input
            type="text"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="e.g., Morning Range Session, Driver Testing, Course Practice..."
            style={inputStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>
            Session Notes: <span style={infoIconStyle}>ⓘ</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Outdoor session, testing new driver shaft, windy conditions..."
            style={textareaStyle}
            rows="3"
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>
            Elevation (feet): <span style={infoIconStyle}>ⓘ</span>
          </label>
          <input
            type="number"
            value={elevation}
            onChange={(e) => setElevation(parseFloat(e.target.value) || 0)}
            placeholder="0"
            style={inputStyle}
          />
        </div>

        <div
          {...getRootProps()}
          style={dropzoneStyle}
        >
          <input {...getInputProps()} />
          <div style={{ fontSize: '48px', marginBottom: theme.spacing.md }}>📁</div>
          <p style={{ fontSize: theme.typography.fontSizes.lg, fontWeight: theme.typography.fontWeights.medium, color: theme.colors.text.primary, marginBottom: theme.spacing.sm }}>
            {isDragActive ? 'Drop the file here...' : 'Drag and drop a .csv file here'}
          </p>
          <p style={{ color: theme.colors.text.secondary }}>or click to select a file</p>
          <p style={{ fontSize: theme.typography.fontSizes.xs, color: theme.colors.text.secondary, marginTop: theme.spacing.sm }}>ⓘ Hover for more info</p>
        </div>

        {uploading && (
          <div style={uploadProgressStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
              <div style={spinnerStyle}></div>
              <p style={{ color: theme.colors.primary, fontWeight: theme.typography.fontWeights.medium }}>Uploading to database...</p>
            </div>
            <div style={progressBarStyle}>
              <div style={progressFillStyle}></div>
            </div>
            <p style={{ textAlign: 'center', fontSize: theme.typography.fontSizes.sm, color: theme.colors.text.secondary, marginTop: theme.spacing.sm }}>
              {Math.round(uploadProgress)}% complete
            </p>
          </div>
        )}

        {error && (
          <div style={errorStyle}>
            <p style={errorTextStyle}>{error}</p>
          </div>
        )}

        {mappedData.length > 0 && (
          <div style={successStyle}>
            <div style={{ fontSize: theme.typography.fontSizes.sm }}>
              <strong style={successTitleStyle}>Sample Output:</strong>
              <pre style={codeStyle}>
                {JSON.stringify(mappedData.slice(0, 3), null, 2)}...
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CSVUploader; 