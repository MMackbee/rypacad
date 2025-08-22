# Data Import & Analysis Features

This document outlines the data import and analysis features implemented based on the dispcirclesapp patterns.

## Overview

The application now includes a comprehensive data import and analysis system that allows users to:

1. **Upload CSV files** from various launch monitors
2. **Process and standardize data** across different vendors
3. **Store data securely** with UID-based access
4. **View session history** and detailed analytics
5. **Analyze performance** by club and session

## Key Features

### 1. Data Import System

#### Supported Launch Monitors
- **GSPro**: Full support with comprehensive field mapping
- **Rapsodo**: Standard golf metrics
- **Foresight**: Professional launch monitor data
- **Trackman**: Industry-standard metrics

#### CSV Upload Process
1. User selects their launch monitor vendor
2. Provides session details (name, notes, elevation)
3. Drags and drops CSV file
4. System validates file format and headers
5. Data is processed and standardized
6. Uploaded to Firestore with progress tracking

#### Data Standardization
All data is normalized to standard field names:
- `ball_speed`: Ball speed in mph
- `carry_distance`: Carry distance in yards
- `total_distance`: Total distance in yards
- `side_total`: Side dispersion in yards
- `spin_rate`: Spin rate in rpm
- `launch_angle`: Launch angle in degrees
- `club`: Normalized club name

### 2. UID-Based Data Access

#### Security Model
- All data is tied to user UID
- Users can only access their own data
- Real-time Firestore listeners for live updates
- Automatic data validation and error handling

#### Data Structure
```javascript
{
  uid: "user_uid",
  batchId: "batch_timestamp",
  sessionName: "Morning Range Session",
  notes: "Testing new driver",
  elevation: 0,
  vendor: "gspro",
  club: "Driver",
  carry_distance: 250,
  side_total: 5,
  ball_speed: 150,
  spin_rate: 2500,
  uploadedAt: timestamp,
  // ... other standardized fields
}
```

### 3. Session Management

#### Session History
- View all uploaded sessions
- Session metadata (name, date, shot count, vendor)
- Quick access to session details
- Delete sessions with confirmation

#### Session Analysis
- Detailed statistics by club
- Shot-by-shot breakdown
- Performance metrics and ranges
- Interactive club selection for filtering

### 4. Data Processing Features

#### Club Name Normalization
Automatic standardization of club names:
- "driver" → "Driver"
- "3w" → "3 Wood"
- "pw" → "Pitching Wedge"
- etc.

#### Numeric Field Parsing
- Robust number parsing with fallbacks
- Handles various CSV formats
- Validates required fields
- Error reporting for invalid data

#### Vendor-Specific Handling
- GSPro: Peak height conversion (yards to feet)
- Multiple spin rate column support
- Vendor-specific field mappings

## File Structure

```
frontend/src/
├── services/
│   └── dataService.js          # Core data processing and Firestore operations
├── components/
│   ├── CSVUploader.js          # CSV upload interface
│   ├── SessionHistory.js       # Session list and management
│   └── SessionView.js          # Detailed session analysis
└── pages/
    ├── DataUploadPage.js       # Upload page wrapper
    └── SessionsPage.js         # Sessions page wrapper
```

## API Functions

### Data Service (`dataService.js`)

#### Core Functions
- `processDataImport()`: Process raw CSV data
- `uploadDataToFirestore()`: Upload with progress tracking
- `getUserSessions()`: Get user's session history
- `getSessionData()`: Get detailed session data
- `deleteSession()`: Delete session and all shots
- `getUserClubData()`: Get all club data across sessions

#### Utility Functions
- `normalizeClubName()`: Standardize club names
- `parseNumber()`: Robust number parsing
- `dataTemplates`: Vendor-specific field mappings

## Usage Examples

### Uploading Data
```javascript
import { processDataImport, uploadDataToFirestore } from '../services/dataService';

// Process CSV data
const processedData = await processDataImport(
  csvRows, 
  'gspro', 
  'Morning Session', 
  'Testing new driver', 
  0, 
  user
);

// Upload to Firestore
await uploadDataToFirestore(processedData, (progress) => {
  console.log(`Upload progress: ${progress}%`);
});
```

### Viewing Sessions
```javascript
import { getUserSessions } from '../services/dataService';

const unsubscribe = getUserSessions(user, (sessions) => {
  console.log('User sessions:', sessions);
});

// Cleanup when component unmounts
return () => unsubscribe();
```

### Analyzing Session Data
```javascript
import { getSessionData } from '../services/dataService';

const unsubscribe = getSessionData(user, batchId, (sessionData) => {
  console.log('Session data:', sessionData);
});
```

## Dependencies

### Required Packages
- `papaparse`: CSV parsing
- `react-dropzone`: File upload interface
- `firebase`: Firestore database operations

### Installation
```bash
npm install papaparse react-dropzone
```

## Security Considerations

1. **UID-based Access**: All data queries include user UID filter
2. **Input Validation**: CSV headers and data are validated
3. **Error Handling**: Comprehensive error handling and user feedback
4. **Data Integrity**: Required fields validation before upload

## Performance Optimizations

1. **Real-time Listeners**: Firestore onSnapshot for live updates
2. **Batch Processing**: Efficient data processing and upload
3. **Progress Tracking**: Upload progress with user feedback
4. **Memory Management**: Proper cleanup of listeners

## Future Enhancements

1. **Advanced Analytics**: Dispersion patterns, shot clustering
2. **Comparison Tools**: Compare sessions and clubs
3. **Export Features**: Export processed data
4. **Chart Visualizations**: Interactive charts and graphs
5. **Mobile Optimization**: Responsive design improvements

## Troubleshooting

### Common Issues

1. **CSV Format Errors**: Ensure headers match vendor template
2. **Upload Failures**: Check network connection and file size
3. **Data Not Appearing**: Verify user authentication
4. **Performance Issues**: Large files may take time to process

### Debug Tips

1. Check browser console for error messages
2. Verify CSV file format and headers
3. Ensure user is authenticated
4. Check Firestore rules and permissions 