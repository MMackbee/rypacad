import { collection, addDoc, query, where, onSnapshot, getDocs, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

// Data templates for different data sources
export const dataTemplates = {
  gspro: {
    "BallSpeed": "ball_speed",
    "LaunchAngle": "launch_angle", 
    "VLA": "vla",
    "PeakHeight": "peak_height",
    "ApexHeight": "peak_height",
    "Decent": "descent_angle",
    "Descent": "descent_angle",
    "Spin": "spin_rate",
    "BackSpin": "back_spin",
    "SideSpin": "side_spin",
    "Carry": "carry_distance",
    "TotalDistance": "total_distance",
    "Offline": "side_total",
    "Club": "club",
    "ClubSpeed": "club_speed",
    "HLA": "hla",
    "DistanceToPin": "distance_to_pin",
    "Path": "path",
    "AoA": "aoa",
    "FaceToTarget": "face_to_target",
    "FaceToPath": "face_to_path",
    "Lie": "lie",
    "Loft": "loft",
    "DynamicLoft": "dynamic_loft",
    "SmashFactor": "smash_factor",
  },
  rapsodo: {
    "BallSpeed": "ball_speed",
    "LaunchAngle": "launch_angle",
    "VLA": "vla", 
    "PeakHeight": "peak_height",
    "ApexHeight": "peak_height",
    "DescentAngle": "descent_angle",
    "SpinRate": "spin_rate",
    "CarryDistance": "carry_distance",
    "TotalDistance": "total_distance",
    "Offline": "side_total",
    "ClubSpeed": "club_speed",
  },
  foresight: {
    "BallSpeed": "ball_speed",
    "LaunchAngle": "launch_angle",
    "VLA": "vla",
    "PeakHeight": "peak_height", 
    "ApexHeight": "peak_height",
    "DescentAngle": "descent_angle",
    "SpinRate": "spin_rate",
    "CarryDistance": "carry_distance",
    "TotalDistance": "total_distance",
    "Offline": "side_total",
    "ClubSpeed": "club_speed",
  },
  trackman: {
    "Ball_Spd": "ball_speed",
    "Launch_Ang": "launch_angle",
    "VLA": "vla",
    "Peak_Height": "peak_height",
    "Apex_Height": "peak_height", 
    "Descent_Ang": "descent_angle",
    "Spin": "spin_rate",
    "Carry": "carry_distance",
    "Total": "total_distance",
    "Offline": "side_total",
    "Club_Spd": "club_speed",
  }
};

// Utility functions for data processing
export const normalizeClubName = (club) => {
  if (!club) return 'Unknown';
  const normalized = club.toString().toLowerCase().trim();
  
  // Common club name mappings
  const mappings = {
    'driver': 'Driver',
    '1 wood': 'Driver',
    '1w': 'Driver',
    '3 wood': '3 Wood',
    '3w': '3 Wood',
    '5 wood': '5 Wood', 
    '5w': '5 Wood',
    '7 wood': '7 Wood',
    '7w': '7 Wood',
    '2 iron': '2 Iron',
    '2i': '2 Iron',
    '3 iron': '3 Iron',
    '3i': '3 Iron',
    '4 iron': '4 Iron',
    '4i': '4 Iron',
    '5 iron': '5 Iron',
    '5i': '5 Iron',
    '6 iron': '6 Iron',
    '6i': '6 Iron',
    '7 iron': '7 Iron',
    '7i': '7 Iron',
    '8 iron': '8 Iron',
    '8i': '8 Iron',
    '9 iron': '9 Iron',
    '9i': '9 Iron',
    'pw': 'Pitching Wedge',
    'pitching wedge': 'Pitching Wedge',
    'gw': 'Gap Wedge',
    'gap wedge': 'Gap Wedge',
    'sw': 'Sand Wedge',
    'sand wedge': 'Sand Wedge',
    'lw': 'Lob Wedge',
    'lob wedge': 'Lob Wedge',
    'aw': 'Approach Wedge',
    'approach wedge': 'Approach Wedge',
    'uw': 'Utility Wedge',
    'utility wedge': 'Utility Wedge'
  };
  
  return mappings[normalized] || club.toString().charAt(0).toUpperCase() + club.toString().slice(1).toLowerCase();
};

export const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
};

// Data import and processing
export const processDataImport = async (rawData, vendor, sessionName, notes, elevation, user) => {
  const template = dataTemplates[vendor];
  if (!template) {
    throw new Error(`Unsupported vendor: ${vendor}`);
  }

  const batchId = `batch_${Date.now()}`;
  const uploadedAt = new Date();
  const processedData = [];

  // Process each row
  rawData.forEach((row, index) => {
    const mapped = {};
    
    // Map fields according to template
    for (const [csvKey, stdKey] of Object.entries(template)) {
      if (row[csvKey] !== undefined) {
        mapped[stdKey] = row[csvKey];
      }
    }

    // Normalize club name
    let club = row.club || row.Club || row.CLUB || '';
    club = normalizeClubName(club);

    // Parse numeric fields
    const numericFields = ['ball_speed', 'club_speed', 'vla', 'peak_height', 'descent_angle', 'spin_rate', 'carry_distance', 'side_total', 'total_distance'];
    numericFields.forEach(field => {
      if (mapped[field] !== undefined) {
        mapped[field] = parseNumber(mapped[field]);
      }
    });

    // Handle special cases
    if (mapped.peak_height !== undefined && vendor === 'gspro') {
      // GSPRO provides peak height in yards, convert to feet
      const heightInYards = parseNumber(mapped.peak_height);
      mapped.peak_height = heightInYards * 3;
    }

    // Support multiple spin rate columns
    if (mapped.spin_rate === undefined) {
      if (row.TotalSpin !== undefined) mapped.spin_rate = parseNumber(row.TotalSpin);
      else if (row.BackSpin !== undefined) mapped.spin_rate = parseNumber(row.BackSpin);
      else if (row.SpinRate !== undefined) mapped.spin_rate = parseNumber(row.SpinRate);
      else if (row.Spin !== undefined) mapped.spin_rate = parseNumber(row.Spin);
    }

    // Create final data object
    const finalData = {
      ...mapped,
      batchId,
      uploadedAt,
      sessionName,
      notes,
      elevation,
      club,
      uid: user?.uid,
      vendor,
      rowIndex: index
    };

    processedData.push(finalData);
  });

  return processedData;
};

// Upload data to Firestore
export const uploadDataToFirestore = async (processedData, onProgress) => {
  if (!processedData || processedData.length === 0) {
    throw new Error("No data to upload");
  }

  const userDataRef = collection(db, "userData");
  
  // Validate required fields
  const requiredFields = ['club', 'carry_distance'];
  const missingFields = processedData.some(row => 
    requiredFields.some(field => !row[field] && row[field] !== 0)
  );
  
  if (missingFields) {
    throw new Error("Some rows are missing required fields (club, carry_distance)");
  }

  // Upload with progress tracking
  for (let i = 0; i < processedData.length; i++) {
    await addDoc(userDataRef, processedData[i]);
    if (onProgress) {
      onProgress(((i + 1) / processedData.length) * 100);
    }
  }

  return processedData.length;
};

// Get user's data sessions
export const getUserSessions = (user, callback) => {
  if (!user) {
    return () => {};
  }

  const q = query(
    collection(db, "userData"), 
    where("uid", "==", user.uid),
    orderBy("uploadedAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const batches = {};
    snapshot.forEach((doc) => {
      const data = doc.data();
      const batchId = data.batchId;
      
      if (!batches[batchId]) {
        let uploadedAt;
        try {
          if (data.uploadedAt && typeof data.uploadedAt.toDate === 'function') {
            uploadedAt = data.uploadedAt.toDate();
          } else if (data.uploadedAt && data.uploadedAt.seconds) {
            uploadedAt = new Date(data.uploadedAt.seconds * 1000);
          } else if (data.uploadedAt && !isNaN(Date.parse(data.uploadedAt))) {
            uploadedAt = new Date(data.uploadedAt);
          } else {
            uploadedAt = new Date();
          }
        } catch (error) {
          uploadedAt = new Date();
        }
        
        batches[batchId] = {
          sessionName: data.sessionName || "",
          notes: data.notes || "No notes",
          uploadedAt,
          batchId,
          shotCount: 0,
          vendor: data.vendor || "Unknown"
        };
      }
      batches[batchId].shotCount += 1;
    });
    
    const sorted = Object.values(batches).sort((a, b) => b.uploadedAt - a.uploadedAt);
    callback(sorted);
  }, (error) => {
    console.error('Firestore query error:', error);
    callback([]);
  });
};

// Get session data by batchId
export const getSessionData = (user, batchId, callback) => {
  if (!user || !batchId) return () => {};

  const q = query(
    collection(db, "userData"),
    where("batchId", "==", batchId),
    where("uid", "==", user.uid)
  );

  return onSnapshot(q, (snapshot) => {
    const sessionData = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        carry: parseNumber(data.carry_distance),
        side: parseNumber(data.side_total || data.side),
        club: normalizeClubName(data.club || 'Unknown')
      };
    }).filter(shot => shot !== null);

    callback(sessionData);
  });
};

// Delete session data
export const deleteSession = async (user, batchId) => {
  if (!user || !batchId) throw new Error("Missing user or batchId");

  const q = query(
    collection(db, "userData"), 
    where("uid", "==", user.uid), 
    where("batchId", "==", batchId)
  );
  
  const snapshot = await getDocs(q);
  const deletions = snapshot.docs.map(doc => deleteDoc(doc.ref));
  await Promise.all(deletions);
  
  return snapshot.size;
};

// Get user's club data across all sessions
export const getUserClubData = (user, callback) => {
  if (!user) return () => {};

  const q = query(
    collection(db, "userData"),
    where("uid", "==", user.uid)
  );

  return onSnapshot(q, (snapshot) => {
    const clubData = {};
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      const club = normalizeClubName(data.club || 'Unknown');
      
      if (!clubData[club]) {
        clubData[club] = [];
      }
      
      clubData[club].push({
        ...data,
        carry: parseNumber(data.carry_distance),
        side: parseNumber(data.side_total || data.side),
        club: club
      });
    });

    callback(clubData);
  });
}; 