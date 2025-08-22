import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  onSnapshot,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

// User Management
export const userService = {
  // Get all users
  async getAllUsers() {
    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching users:', error);
      // Return empty array instead of throwing to prevent crashes
      return [];
    }
  },

  // Get user by ID
  async getUserById(userId) {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        return { id: userSnap.id, ...userSnap.data() };
      }
      return null;
    } catch (error) {
      console.error('Error fetching user:', error);
      // Return null instead of throwing to prevent crashes
      return null;
    }
  },

  // Update user role
  async updateUserRole(userId, newRole) {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        role: newRole,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error updating user role:', error);
      throw new Error('Failed to update user role. Please try again.');
    }
  },

  // Update user status
  async updateUserStatus(userId, status) {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        status: status,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error updating user status:', error);
      throw new Error('Failed to update user status. Please try again.');
    }
  },

  // Get users by role
  async getUsersByRole(role) {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('role', '==', role));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching users by role:', error);
      // Return empty array instead of throwing to prevent crashes
      return [];
    }
  },

  // Get user by studentId
  async getUserByStudentId(studentId) {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('studentId', '==', studentId));
      const snapshot = await getDocs(q);
      if (snapshot.docs.length > 0) {
        const docSnap = snapshot.docs[0];
        return { id: docSnap.id, ...docSnap.data() };
      }
      return null;
    } catch (error) {
      console.error('Error fetching user by studentId:', error);
      return null;
    }
  },

  // Generate a unique 6-digit studentId (numeric) and ensure uniqueness
  async generateUniqueStudentId() {
    const generate = () => String(Math.floor(100000 + Math.random() * 900000));
    for (let i = 0; i < 10; i++) {
      const candidate = generate();
      const existing = await userService.getUserByStudentId(candidate);
      if (!existing) return candidate;
    }
    return String(Date.now()).slice(-6);
  }
};

// Student Management
export const studentService = {
  // Get all students
  async getAllStudents() {
    try {
      const studentsRef = collection(db, 'students');
      const snapshot = await getDocs(studentsRef);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching students:', error);
      throw error;
    }
  },

  // Get students by coach
  async getStudentsByCoach(coachId) {
    try {
      const studentsRef = collection(db, 'students');
      const q = query(studentsRef, where('coachId', '==', coachId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching students by coach:', error);
      throw error;
    }
  },

  // Add new student
  async addStudent(studentData) {
    try {
      const studentsRef = collection(db, 'students');
      const docRef = await addDoc(studentsRef, {
        ...studentData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error adding student:', error);
      throw error;
    }
  },

  // Update student
  async updateStudent(studentId, updateData) {
    try {
      const studentRef = doc(db, 'students', studentId);
      await updateDoc(studentRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error updating student:', error);
      throw error;
    }
  },

  // Update student progress
  async updateStudentProgress(studentId, progress) {
    try {
      const studentRef = doc(db, 'students', studentId);
      await updateDoc(studentRef, {
        progress: progress,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error updating student progress:', error);
      throw error;
    }
  }
};

// Session Management
export const sessionService = {
  // Get all sessions
  async getAllSessions() {
    try {
      const sessionsRef = collection(db, 'sessions');
      const q = query(sessionsRef, orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching sessions:', error);
      throw error;
    }
  },

  // Get sessions by coach
  async getSessionsByCoach(coachId) {
    try {
      const sessionsRef = collection(db, 'sessions');
      const q = query(
        sessionsRef, 
        where('coachId', '==', coachId),
        orderBy('date', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching sessions by coach:', error);
      throw error;
    }
  },

  // Get sessions by date range
  async getSessionsByDateRange(startDate, endDate) {
    try {
      const sessionsRef = collection(db, 'sessions');
      const q = query(
        sessionsRef,
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching sessions by date range:', error);
      throw error;
    }
  },

  // Create new session
  async createSession(sessionData) {
    try {
      const sessionsRef = collection(db, 'sessions');
      const docRef = await addDoc(sessionsRef, {
        ...sessionData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  },

  // Update session
  async updateSession(sessionId, updateData) {
    try {
      const sessionRef = doc(db, 'sessions', sessionId);
      await updateDoc(sessionRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error updating session:', error);
      throw error;
    }
  },

  // Delete session
  async deleteSession(sessionId) {
    try {
      const sessionRef = doc(db, 'sessions', sessionId);
      await deleteDoc(sessionRef);
      return true;
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  }
};

// Booking Management
export const bookingService = {
  // Get all bookings
  async getAllBookings() {
    try {
      const bookingsRef = collection(db, 'bookings');
      const q = query(bookingsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching bookings:', error);
      // Return empty array instead of throwing to prevent crashes
      return [];
    }
  },

  // Get bookings by user
  async getBookingsByUser(userId) {
    try {
      const bookingsRef = collection(db, 'bookings');
      const q = query(
        bookingsRef,
        where('userId', '==', userId)
        // Temporarily removed orderBy to fix index error
        // orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const bookings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort by createdAt in JavaScript instead
      return bookings.sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return b.createdAt.toDate ? b.createdAt.toDate() - a.createdAt.toDate() : b.createdAt - a.createdAt;
        }
        return 0;
      });
    } catch (error) {
      console.error('Error fetching bookings by user:', error);
      // Return empty array instead of throwing to prevent crashes
      return [];
    }
  },

  // Create booking
  async createBooking(bookingData) {
    try {
      const bookingsRef = collection(db, 'bookings');
      const docRef = await addDoc(bookingsRef, {
        ...bookingData,
        status: 'confirmed',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating booking:', error);
      throw new Error('Failed to create booking. Please try again.');
    }
  },

  // Update booking status
  async updateBookingStatus(bookingId, status) {
    try {
      const bookingRef = doc(db, 'bookings', bookingId);
      await updateDoc(bookingRef, {
        status: status,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error updating booking status:', error);
      throw new Error('Failed to update booking status. Please try again.');
    }
  }
};

// Analytics Service
export const analyticsService = {
  // Get system analytics
  async getSystemAnalytics() {
    try {
      // This would typically aggregate data from multiple collections
      const users = await userService.getAllUsers();
      const bookings = await bookingService.getAllBookings();
      const sessions = await sessionService.getAllSessions();

      const totalUsers = users.length;
      const activeUsers = users.filter(user => user.status === 'active').length;
      const totalBookings = bookings.length;
      const totalSessions = sessions.length;

      // Calculate revenue (this would need to be enhanced with actual payment data)
      const totalRevenue = bookings.reduce((sum, booking) => sum + (booking.price || 0), 0);

      return {
        totalUsers,
        activeUsers,
        totalBookings,
        totalSessions,
        totalRevenue,
        userGrowth: 15.2, // This would be calculated from historical data
        revenueGrowth: 8.5 // This would be calculated from historical data
      };
    } catch (error) {
      console.error('Error fetching system analytics:', error);
      throw error;
    }
  },

  // Get coach analytics
  async getCoachAnalytics(coachId) {
    try {
      const students = await studentService.getStudentsByCoach(coachId);
      const sessions = await sessionService.getSessionsByCoach(coachId);

      const activeStudents = students.length;
      const totalSessions = sessions.length;
      const averageProgress = students.length > 0 
        ? students.reduce((sum, student) => sum + (student.progress || 0), 0) / students.length 
        : 0;

      return {
        activeStudents,
        totalSessions,
        averageProgress: Math.round(averageProgress),
        recentActivity: students.slice(0, 5)
      };
    } catch (error) {
      console.error('Error fetching coach analytics:', error);
      throw error;
    }
  }
};

// Real-time listeners
export const realtimeService = {
  // Listen to users changes
  onUsersChange(callback) {
    const usersRef = collection(db, 'users');
    return onSnapshot(usersRef, (snapshot) => {
      const users = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      callback(users);
    });
  },

  // Listen to students changes for a coach
  onStudentsChange(coachId, callback) {
    const studentsRef = collection(db, 'students');
    const q = query(studentsRef, where('coachId', '==', coachId));
    return onSnapshot(q, (snapshot) => {
      const students = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      callback(students);
    });
  },

  // Listen to sessions changes for a coach
  onSessionsChange(coachId, callback) {
    const sessionsRef = collection(db, 'sessions');
    const q = query(
      sessionsRef, 
      where('coachId', '==', coachId),
      orderBy('date', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      const sessions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      callback(sessions);
    });
  }
};
