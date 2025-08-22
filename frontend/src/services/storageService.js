import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject, 
  listAll,
  getMetadata 
} from 'firebase/storage';
import { storage } from '../firebase';

// Firebase Storage Service
export const storageService = {
  // Upload profile picture
  async uploadProfilePicture(userId, file) {
    try {
      const fileExtension = file.name.split('.').pop();
      const fileName = `profile_${Date.now()}.${fileExtension}`;
      const storageRef = ref(storage, `users/${userId}/profile/${fileName}`);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      return {
        success: true,
        url: downloadURL,
        fileName: fileName,
        path: snapshot.ref.fullPath
      };
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      throw error;
    }
  },

  // Upload session media (videos, photos)
  async uploadSessionMedia(sessionId, file, coachId) {
    try {
      const fileExtension = file.name.split('.').pop();
      const fileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `sessions/${sessionId}/media/${fileName}`);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      return {
        success: true,
        url: downloadURL,
        fileName: fileName,
        path: snapshot.ref.fullPath,
        uploadedBy: coachId,
        uploadedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error uploading session media:', error);
      throw error;
    }
  },

  // Upload tournament materials
  async uploadTournamentMaterials(tournamentId, file, coachId) {
    try {
      const fileExtension = file.name.split('.').pop();
      const fileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `tournaments/${tournamentId}/materials/${fileName}`);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      return {
        success: true,
        url: downloadURL,
        fileName: fileName,
        path: snapshot.ref.fullPath,
        uploadedBy: coachId,
        uploadedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error uploading tournament materials:', error);
      throw error;
    }
  },

  // Upload coach resources
  async uploadCoachResource(coachId, file, category = 'general') {
    try {
      const fileExtension = file.name.split('.').pop();
      const fileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `coaches/${coachId}/${category}/${fileName}`);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      return {
        success: true,
        url: downloadURL,
        fileName: fileName,
        path: snapshot.ref.fullPath,
        category: category,
        uploadedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error uploading coach resource:', error);
      throw error;
    }
  },

  // Get download URL for a file
  async getDownloadURL(filePath) {
    try {
      const storageRef = ref(storage, filePath);
      const url = await getDownloadURL(storageRef);
      return url;
    } catch (error) {
      console.error('Error getting download URL:', error);
      throw error;
    }
  },

  // Delete a file
  async deleteFile(filePath) {
    try {
      const storageRef = ref(storage, filePath);
      await deleteObject(storageRef);
      return { success: true };
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  },

  // List files in a directory
  async listFiles(directoryPath) {
    try {
      const storageRef = ref(storage, directoryPath);
      const result = await listAll(storageRef);
      
      const files = await Promise.all(
        result.items.map(async (item) => {
          const metadata = await getMetadata(item);
          const url = await getDownloadURL(item);
          
          return {
            name: item.name,
            fullPath: item.fullPath,
            url: url,
            size: metadata.size,
            contentType: metadata.contentType,
            timeCreated: metadata.timeCreated,
            updated: metadata.updated
          };
        })
      );
      
      return files;
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  },

  // Get file metadata
  async getFileMetadata(filePath) {
    try {
      const storageRef = ref(storage, filePath);
      const metadata = await getMetadata(storageRef);
      return metadata;
    } catch (error) {
      console.error('Error getting file metadata:', error);
      throw error;
    }
  },

  // Upload multiple files
  async uploadMultipleFiles(files, basePath, metadata = {}) {
    try {
      const uploadPromises = files.map(async (file, index) => {
        const fileExtension = file.name.split('.').pop();
        const fileName = `${Date.now()}_${index}_${file.name}`;
        const storageRef = ref(storage, `${basePath}/${fileName}`);
        
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        return {
          success: true,
          url: downloadURL,
          fileName: fileName,
          originalName: file.name,
          path: snapshot.ref.fullPath,
          size: file.size,
          type: file.type,
          ...metadata
        };
      });
      
      const results = await Promise.all(uploadPromises);
      return results;
    } catch (error) {
      console.error('Error uploading multiple files:', error);
      throw error;
    }
  },

  // Validate file before upload
  validateFile(file, options = {}) {
    const {
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime', 'application/pdf'],
      maxFileNameLength = 100
    } = options;

    const errors = [];

    // Check file size
    if (file.size > maxSize) {
      errors.push(`File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    // Check file type
    if (!allowedTypes.includes(file.type)) {
      errors.push(`File type ${file.type} is not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    }

    // Check file name length
    if (file.name.length > maxFileNameLength) {
      errors.push(`File name must be less than ${maxFileNameLength} characters`);
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  },

  // Generate thumbnail for video/image
  async generateThumbnail(file) {
    return new Promise((resolve, reject) => {
      if (file.type.startsWith('image/')) {
        // For images, create a thumbnail
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
          const maxSize = 200;
          let { width, height } = img;
          
          if (width > height) {
            if (width > maxSize) {
              height = (height * maxSize) / width;
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = (width * maxSize) / height;
              height = maxSize;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/jpeg', 0.8);
        };
        
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      } else if (file.type.startsWith('video/')) {
        // For videos, create a thumbnail from first frame
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        video.onloadeddata = () => {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          
          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/jpeg', 0.8);
        };
        
        video.onerror = reject;
        video.src = URL.createObjectURL(file);
      } else {
        reject(new Error('File type not supported for thumbnail generation'));
      }
    });
  }
};

// File upload utilities
export const uploadUtils = {
  // Format file size for display
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  // Get file icon based on type
  getFileIcon(fileType) {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType.startsWith('video/')) return '🎥';
    if (fileType === 'application/pdf') return '📄';
    if (fileType.startsWith('text/')) return '📝';
    return '📎';
  },

  // Check if file is an image
  isImage(fileType) {
    return fileType.startsWith('image/');
  },

  // Check if file is a video
  isVideo(fileType) {
    return fileType.startsWith('video/');
  },

  // Check if file is a document
  isDocument(fileType) {
    return fileType === 'application/pdf' || fileType.startsWith('text/');
  }
};
