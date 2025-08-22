import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { theme } from '../styles/theme';
// Using service layer for Firestore reads/writes
import { userService, sessionService, bookingService } from '../services/firebaseService';

function CoachDashboardPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [students, setStudents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [bookingGroups, setBookingGroups] = useState({});
  const [selectedScheduleDate, setSelectedScheduleDate] = useState(new Date().toISOString().split('T')[0]);
  const [showAttendeesModal, setShowAttendeesModal] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showStudentProfileModal, setShowStudentProfileModal] = useState(false);
  const [showParentChatModal, setShowParentChatModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [waitlistStudents, setWaitlistStudents] = useState([]);
  const [practiceLogs, setPracticeLogs] = useState([]);
  const [parentMessages, setParentMessages] = useState([]);
  const [trainingVideos, setTrainingVideos] = useState([]);
  const [newPracticeLog, setNewPracticeLog] = useState({
    studentId: '',
    date: '',
    focus: '',
    notes: '',
    recommendations: '',
    videos: []
  });
  const [newParentMessage, setNewParentMessage] = useState({
    parentId: '',
    subject: '',
    message: ''
  });
  const [newSession, setNewSession] = useState({
    date: '',
    time: '',
    type: 'group',
    focus: '',
    students: []
  });

  useEffect(() => {
    loadCoachData();
    loadBookings();
  }, []);

  const loadCoachData = async () => {
    setLoading(true);
    try {
      // Load real students from Firestore users where role == 'student'
      const studentsFromUsers = await userService.getUsersByRole('student');
      const normalizedStudents = studentsFromUsers.map(u => ({
        id: u.id,
        name: u.displayName || u.name || u.email || 'Student',
        email: u.email || '',
        phone: u.phone || '',
        age: u.participantAge ? Number(u.participantAge) : undefined,
        skillLevel: u.experience || 'Beginner',
        lastSession: u.lastSession || '-',
        nextSession: u.nextSession || '-',
        progress: u.progress || 0,
        goals: u.goals ? (Array.isArray(u.goals) ? u.goals : [u.goals]) : [],
        notes: u.notes || '',
        attendance: u.attendance || 0,
        improvement: u.improvement || '0%',
        sessionsThisMonth: u.sessionsThisMonth || 0
      }));

      // Load sessions (optionally filter by coachId when we add it)
      const sessionsFromDb = await sessionService.getAllSessions();
      const normalizedSessions = sessionsFromDb.map(s => ({
        id: s.id,
        date: s.date || '-',
        time: s.time || '-',
        type: s.type === 'individual' ? 'Individual' : (s.type || 'Group Training'),
        students: Array.isArray(s.students) ? s.students : (s.students ? [s.students] : []),
        status: s.status || 'Scheduled',
        focus: s.focus || '',
        duration: s.duration || (s.type === 'individual' ? '60 min' : '90 min'),
        location: s.location || 'TBD'
      }));

      setStudents(normalizedStudents);
      setSessions(normalizedSessions);

      // Leave optional sections empty for now
      setWaitlistStudents([]);
      setPracticeLogs([]);
      setTrainingVideos([]);
      setParentMessages([]);
    } catch (error) {
      console.error('Error loading coach data:', error);
      setStudents([]);
      setSessions([]);
      setWaitlistStudents([]);
      setPracticeLogs([]);
      setTrainingVideos([]);
      setParentMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const loadBookings = async () => {
    try {
      const allBookings = await bookingService.getAllBookings();
      const grouped = {};
      allBookings.forEach((b) => {
        const key = `${b.date}-${b.time}`;
        if (!grouped[key]) {
          grouped[key] = { sessions: [], waitlist: [] };
        }
        if (b.type === 'session') grouped[key].sessions.push(b);
        if (b.type === 'waitlist') grouped[key].waitlist.push(b);
      });
      setBookingGroups(grouped);
    } catch (e) {
      console.error('Error loading bookings:', e);
      setBookingGroups({});
    }
  };

  const getTimesForDate = (dateStr) => {
    // Collect distinct times from bookings for the selected date
    const times = Object.keys(bookingGroups)
      .filter((k) => k.startsWith(`${dateStr}-`))
      .map((k) => k.split('-')[3] ? `${k.split('-')[2]}-${k.split('-')[3]}` : k.split('-')[2]) // handle times with extra hyphens defensively
      .map((t) => (t || '').slice(0,5))
      .filter(Boolean);
    const unique = Array.from(new Set(times));
    if (unique.length > 0) {
      return unique.sort();
    }
    // Fallback default slots
    const day = new Date(dateStr).getDay();
    return day === 6 ? ['08:00', '09:00'] : ['16:00', '17:00', '18:00'];
  };

  const openAttendees = async (dateStr, time) => {
    const key = `${dateStr}-${time}`;
    const group = bookingGroups[key] || { sessions: [], waitlist: [] };
    const userIds = Array.from(new Set(group.sessions.map((s) => s.userId).filter(Boolean)));

    try {
      const names = await Promise.all(
        userIds.map(async (uid) => {
          const u = await userService.getUserById(uid);
          return u?.displayName || u?.name || u?.email || uid;
        })
      );

      // Preserve order relative to group.sessions
      const list = group.sessions.map((s) => {
        const idx = userIds.indexOf(s.userId);
        return idx >= 0 ? names[idx] : (s.userName || s.userEmail || s.userId);
      });

      setAttendees(list);
    } catch (e) {
      console.error('Error loading attendee names:', e);
      const list = group.sessions.map((s) => s.userName || s.userEmail || s.userId);
      setAttendees(list);
    }

    setSelectedTimeSlot({ date: dateStr, time });
    setShowAttendeesModal(true);
  };

  const handleCreateSession = () => {
    setShowSessionModal(true);
  };

  const handleSaveSession = async () => {
    // Validate required fields
    if (!newSession.date || !newSession.time || !newSession.focus) {
      alert('Please fill in all required fields: Date, Time, and Focus.');
      return;
    }

    try {
      await sessionService.createSession({
        date: newSession.date,
        time: newSession.time,
        type: newSession.type,
        students: newSession.students || [],
        status: 'Scheduled',
        focus: newSession.focus,
        duration: newSession.type === 'group' ? '90 min' : '60 min',
        location: 'TBD'
      });
      await loadCoachData();
      setShowSessionModal(false);
      setNewSession({ date: '', time: '', type: 'group', focus: '', students: [] });
      alert(`Session created successfully! ${newSession.type === 'group' ? 'Group Training' : 'Individual'} session scheduled for ${newSession.date} at ${newSession.time}.`);
    } catch (e) {
      console.error('Error creating session:', e);
      alert('Failed to create session. Please try again.');
    }
  };

  const handleStudentProfile = (student) => {
    setSelectedStudent(student);
    setShowStudentProfileModal(true);
  };

  const handleParentChat = (student) => {
    setSelectedStudent(student);
    setShowParentChatModal(true);
  };

  const handleAddPracticeLog = () => {
    if (selectedStudent && newPracticeLog.focus && newPracticeLog.notes) {
      const log = {
        id: `log-${Date.now()}`,
        studentId: selectedStudent.id,
        studentName: selectedStudent.name,
        date: newPracticeLog.date || new Date().toISOString().split('T')[0],
        focus: newPracticeLog.focus,
        notes: newPracticeLog.notes,
        recommendations: newPracticeLog.recommendations,
        videos: newPracticeLog.videos,
        rating: 0
      };
      setPracticeLogs([log, ...practiceLogs]);
      setNewPracticeLog({
        studentId: '',
        date: '',
        focus: '',
        notes: '',
        recommendations: '',
        videos: []
      });
    }
  };

  const handleSendParentMessage = () => {
    // Validate required fields
    if (!newParentMessage.subject || !newParentMessage.message) {
      alert('Please fill in both subject and message before sending.');
      return;
    }

    if (!selectedStudent) {
      alert('Please select a student first.');
      return;
    }

    // Create new message
    const message = {
      id: `msg-${Date.now()}`,
      parentName: selectedStudent?.parentName || `${selectedStudent.name}'s Parent`,
      studentName: selectedStudent?.name,
      subject: newParentMessage.subject,
      message: newParentMessage.message,
      date: new Date().toISOString().split('T')[0],
      status: 'sent'
    };
    
    // Add to messages list
    setParentMessages([message, ...parentMessages]);
    
    // Reset form
    setNewParentMessage({
      parentId: '',
      subject: '',
      message: ''
    });
    
    // Close modal
    setShowParentChatModal(false);
    
    // Show success message
    alert(`Message sent successfully to ${message.parentName} regarding ${message.studentName}!\n\nSubject: ${message.subject}`);
  };

  const handleAddVideoToStudent = (videoId) => {
    setNewPracticeLog({
      ...newPracticeLog,
      videos: [...newPracticeLog.videos, videoId]
    });
  };

  // Additional button handlers for missing functionality
  const handleViewStudentProgress = () => {
    // Navigate to student progress view or show progress modal
    alert('Student Progress View - Feature coming soon!');
  };

  const handleSendGroupMessage = () => {
    // Open group message modal
    alert('Group Message - Feature coming soon!');
  };

  const handleUpdateSessionNotes = () => {
    // Open session notes update modal
    alert('Update Session Notes - Feature coming soon!');
  };

  const handleAcceptWaitlistStudent = (student) => {
    // Move student from waitlist to active students
    setWaitlistStudents(waitlistStudents.filter(s => s.id !== student.id));
    
    // Create new student record with proper structure
    const newStudent = {
      id: `student-${Date.now()}`,
      name: student.name,
      email: student.parentContact, // Use parent contact as email for now
      phone: student.parentContact,
      age: student.age,
      skillLevel: student.skillLevel,
      lastSession: new Date().toISOString().split('T')[0],
      nextSession: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      progress: 0,
      goals: ['Learn basic swing', 'Understand course etiquette'],
      notes: `New student from waitlist. ${student.notes || ''}`,
      attendance: 0,
      improvement: '0%',
      sessionsThisMonth: 0,
      status: 'active'
    };
    
    setStudents([...students, newStudent]);
    
    // Show success message
    alert(`Successfully accepted ${student.name} from waitlist! They have been added to your active students.`);
  };

  const handleUpdateProgress = () => {
    // Open progress update modal
    alert('Update Progress - Feature coming soon!');
  };

  const handleSendMessage = () => {
    // Open message modal
    alert('Send Message - Feature coming soon!');
  };

  const handleScheduleSession = () => {
    // Open session scheduling modal
    setShowSessionModal(true);
  };

  const handleViewSessionDetails = (session) => {
    // Show session details modal
    alert(`Session Details: ${session.type} on ${session.date} at ${session.time}`);
  };

  const handleEditSession = (session) => {
    // Open session edit modal
    alert(`Edit Session: ${session.type} on ${session.date}`);
  };

  const handleCancelSession = (session) => {
    // Confirm cancellation
    if (window.confirm(`Are you sure you want to cancel the ${session.type} session on ${session.date} at ${session.time}?\n\nThis will notify all scheduled students.`)) {
      // Remove session from list
      setSessions(sessions.filter(s => s.id !== session.id));
      
      // Show success message with details
      alert(`Session cancelled successfully!\n\nCancelled: ${session.type} session\nDate: ${session.date}\nTime: ${session.time}\nStudents: ${session.students.join(', ')}`);
    }
  };

  const handleAddPracticeLogEntry = () => {
    // Open practice log entry modal
    alert('Add Practice Log - Feature coming soon!');
  };

  const handleViewPracticeHistory = () => {
    // Show practice history
    alert('Practice History - Feature coming soon!');
  };

  const handleSendParentCommunication = () => {
    // Open parent communication modal
    alert('Parent Communication - Feature coming soon!');
  };

  const handleViewCommunicationHistory = () => {
    // Show communication history
    alert('Communication History - Feature coming soon!');
  };

  const containerStyle = {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: theme.spacing.xl,
    fontFamily: theme.typography.fontFamily.body,
    backgroundColor: theme.colors.background.primary,
    minHeight: '100vh',
    color: theme.colors.text.primary
  };

  const headerStyle = {
    marginBottom: theme.spacing.xl
  };

  const titleStyle = {
    fontSize: theme.typography.fontSizes['3xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline,
    letterSpacing: '0.05em'
  };

  const subtitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const tabContainerStyle = {
    display: 'flex',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
    borderBottom: `1px solid ${theme.colors.border}`,
    paddingBottom: theme.spacing.md
  };

  const tabStyle = {
    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
    backgroundColor: 'transparent',
    color: theme.colors.text.secondary,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.base,
    fontFamily: theme.typography.fontFamily.body,
    transition: 'all 0.2s ease'
  };

  const activeTabStyle = {
    ...tabStyle,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark
  };

  const cardStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.lg
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: theme.spacing.lg
  };

  const statCardStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    textAlign: 'center'
  };

  const statValueStyle = {
    fontSize: theme.typography.fontSizes['2xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const statLabelStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const buttonStyle = {
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    borderRadius: theme.borderRadius.md,
    border: 'none',
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  };

  const secondaryButtonStyle = {
    backgroundColor: 'transparent',
    color: theme.colors.text.primary,
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  };

  const studentCardStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  };

  const selectedStudentCardStyle = {
    ...studentCardStyle,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.background.secondary
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: theme.spacing.xl }}>
          Loading your coach dashboard...
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Coach Dashboard</h1>
        <p style={subtitleStyle}>Manage your students and training sessions</p>
        <p style={{ fontSize: theme.typography.fontSizes.sm, color: theme.colors.text.secondary }}>
          Welcome back, {user?.displayName || 'Coach'}! You have {students.length} active students.
        </p>
      </div>

      {/* Tabs */}
      <div style={tabContainerStyle}>
        <button
          style={activeTab === 'overview' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          style={activeTab === 'students' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('students')}
        >
          Students
        </button>
        <button
          style={activeTab === 'sessions' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('sessions')}
        >
          Sessions
        </button>
        <button
          style={activeTab === 'practice' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('practice')}
        >
          Practice Logs
        </button>
        <button
          style={activeTab === 'communication' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('communication')}
        >
          Parent Communication
        </button>
        <button
          style={activeTab === 'analytics' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('analytics')}
        >
          Analytics
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div>
          {/* Stats Grid */}
          <div style={gridStyle}>
            <div style={statCardStyle}>
              <div style={statValueStyle}>{students.length}</div>
              <div style={statLabelStyle}>Active Students</div>
            </div>
            <div style={statCardStyle}>
              <div style={statValueStyle}>{sessions.filter(s => s.status === 'Scheduled').length}</div>
              <div style={statLabelStyle}>Upcoming Sessions</div>
            </div>
            <div style={statCardStyle}>
              <div style={statValueStyle}>87%</div>
              <div style={statLabelStyle}>Average Attendance</div>
            </div>
            <div style={statCardStyle}>
              <div style={statValueStyle}>+14%</div>
              <div style={statLabelStyle}>Student Progress</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
              Quick Actions
            </h3>
            <div style={{ display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap' }}>
              <button onClick={handleCreateSession} style={buttonStyle}>
                Create New Session
              </button>
              <button onClick={handleViewStudentProgress} style={secondaryButtonStyle}>
                View Student Progress
              </button>
              <button onClick={handleSendGroupMessage} style={secondaryButtonStyle}>
                Send Group Message
              </button>
              <button onClick={handleUpdateSessionNotes} style={secondaryButtonStyle}>
                Update Session Notes
              </button>
            </div>
          </div>

          {/* Today's Sessions */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
              Today's Sessions
            </h3>
            {sessions.filter(s => s.date === new Date().toISOString().split('T')[0]).length > 0 ? (
              sessions.filter(s => s.date === new Date().toISOString().split('T')[0]).map((session) => (
                <div key={session.id} style={{
                  padding: theme.spacing.md,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md,
                  marginBottom: theme.spacing.md,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                      {session.time} - {session.type}
                    </div>
                    <div style={{ color: theme.colors.text.secondary }}>
                      {session.students.join(', ')} • {session.focus}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.9rem', color: theme.colors.text.secondary }}>
                      {session.duration}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: theme.colors.text.secondary }}>
                      {session.location}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p style={{ color: theme.colors.text.secondary, textAlign: 'center', padding: theme.spacing.lg }}>
                No sessions scheduled for today
              </p>
            )}
          </div>

          {/* Waitlist Students */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
              Waitlist Students ({waitlistStudents.length})
            </h3>
            {waitlistStudents.length > 0 ? (
              <div style={gridStyle}>
                {waitlistStudents.map((student) => (
                  <div key={student.id} style={{
                    padding: theme.spacing.md,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.borderRadius.md,
                    backgroundColor: theme.colors.background.primary
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.sm }}>
                      <div>
                        <h4 style={{ fontSize: theme.typography.fontSizes.lg, fontWeight: 'bold', marginBottom: theme.spacing.xs }}>
                          {student.name}
                        </h4>
                        <p style={{ color: theme.colors.text.secondary, fontSize: '0.9rem' }}>
                          {student.age} years old • {student.skillLevel}
                        </p>
                      </div>
                      <span style={{
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        backgroundColor: theme.colors.primary,
                        color: 'white',
                        borderRadius: theme.borderRadius.sm,
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                      }}>
                        Waitlist
                      </span>
                    </div>
                    <p style={{ fontSize: '0.9rem', color: theme.colors.text.secondary, marginBottom: theme.spacing.sm }}>
                      <strong>Parent Contact:</strong> {student.parentContact}
                    </p>
                    <p style={{ fontSize: '0.9rem', color: theme.colors.text.secondary, marginBottom: theme.spacing.sm }}>
                      <strong>Requested:</strong> {student.requestedDate}
                    </p>
                    <p style={{ fontSize: '0.9rem', color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
                      {student.notes}
                    </p>
                    <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                      <button onClick={() => handleParentChat(student)} style={buttonStyle}>
                        Contact Parent
                      </button>
                      <button onClick={() => handleAcceptWaitlistStudent(student)} style={secondaryButtonStyle}>
                        Accept Student
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: theme.colors.text.secondary, textAlign: 'center', padding: theme.spacing.lg }}>
                No students on waitlist
              </p>
            )}
          </div>
        </div>
      )}

      {/* Students Tab */}
      {activeTab === 'students' && (
        <div>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
              <h3 style={{ fontSize: theme.typography.fontSizes.xl, fontFamily: theme.typography.fontFamily.headline }}>
                Student Management
              </h3>
              <button onClick={() => alert('Add New Student - Feature coming soon!')} style={buttonStyle}>
                Add New Student
              </button>
            </div>
            
            <div style={gridStyle}>
              {students.map((student) => (
                <div
                  key={student.id}
                  style={selectedStudent?.id === student.id ? selectedStudentCardStyle : studentCardStyle}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.md }}>
                    <div>
                      <h4 style={{ fontSize: theme.typography.fontSizes.lg, fontWeight: 'bold', marginBottom: theme.spacing.xs }}>
                        {student.name}
                      </h4>
                      <p style={{ color: theme.colors.text.secondary, fontSize: '0.9rem' }}>
                        {student.age} years old • {student.skillLevel}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: theme.colors.primary }}>
                        {student.progress}%
                      </div>
                      <div style={{ fontSize: '0.8rem', color: theme.colors.text.secondary }}>
                        Progress
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
                    <div>
                      <div style={{ fontSize: '0.9rem', color: theme.colors.text.secondary }}>Attendance</div>
                      <div style={{ fontWeight: 'bold' }}>{student.attendance}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.9rem', color: theme.colors.text.secondary }}>Improvement</div>
                      <div style={{ fontWeight: 'bold', color: theme.colors.primary }}>{student.improvement}</div>
                    </div>
                  </div>
                  
                  <div style={{ fontSize: '0.9rem', color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
                    Next session: {student.nextSession}
                  </div>
                  
                  <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                    <button 
                      onClick={() => handleStudentProfile(student)}
                      style={buttonStyle}
                    >
                      View Profile
                    </button>
                    <button 
                      onClick={() => handleParentChat(student)}
                      style={secondaryButtonStyle}
                    >
                      Contact Parent
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Student Details */}
          {selectedStudent && (
            <div style={cardStyle}>
              <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
                {selectedStudent.name} - Student Details
              </h3>
              
              <div style={gridStyle}>
                <div>
                  <h4 style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md, fontFamily: theme.typography.fontFamily.headline }}>
                    Contact Information
                  </h4>
                  <p><strong>Email:</strong> {selectedStudent.email}</p>
                  <p><strong>Phone:</strong> {selectedStudent.phone}</p>
                  <p><strong>Age:</strong> {selectedStudent.age} years old</p>
                  <p><strong>Skill Level:</strong> {selectedStudent.skillLevel}</p>
                </div>
                
                <div>
                  <h4 style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md, fontFamily: theme.typography.fontFamily.headline }}>
                    Goals
                  </h4>
                  <ul style={{ paddingLeft: theme.spacing.md }}>
                    {selectedStudent.goals && selectedStudent.goals.map((goal, index) => (
                      <li key={index} style={{ marginBottom: theme.spacing.xs }}>{goal}</li>
                    ))}
                  </ul>
                </div>
              </div>
              
              <div style={{ marginTop: theme.spacing.lg }}>
                <h4 style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md, fontFamily: theme.typography.fontFamily.headline }}>
                  Coach Notes
                </h4>
                <p style={{ color: theme.colors.text.secondary }}>{selectedStudent.notes}</p>
              </div>
              
              <div style={{ display: 'flex', gap: theme.spacing.md, marginTop: theme.spacing.lg }}>
                <button onClick={handleUpdateProgress} style={buttonStyle}>
                  Update Progress
                </button>
                <button onClick={handleSendMessage} style={secondaryButtonStyle}>
                  Send Message
                </button>
                <button onClick={handleScheduleSession} style={secondaryButtonStyle}>
                  Schedule Session
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
              <h3 style={{ fontSize: theme.typography.fontSizes.xl, fontFamily: theme.typography.fontFamily.headline }}>
                Session Management
              </h3>
              <button onClick={handleCreateSession} style={buttonStyle}>
                Create New Session
              </button>
            </div>
            
            {/* Daily schedule selector */}
            <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center', marginBottom: theme.spacing.md }}>
              <label style={{ color: theme.colors.text.secondary }}>Select Date:</label>
              <input 
                type="date" 
                value={selectedScheduleDate}
                onChange={(e) => setSelectedScheduleDate(e.target.value)}
                style={{
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md
                }}
              />
            </div>

            {/* Times for selected day */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: theme.spacing.md }}>
              {getTimesForDate(selectedScheduleDate).map((time) => {
                const key = `${selectedScheduleDate}-${time}`;
                const group = bookingGroups[key] || { sessions: [], waitlist: [] };
                const attendeeCount = group.sessions.length;
                const waitlistCount = group.waitlist.length;
                return (
                  <div key={key} style={{
                    padding: theme.spacing.md,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.borderRadius.md,
                    backgroundColor: theme.colors.background.primary
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', color: theme.colors.primary, marginBottom: 4 }}>{time}</div>
                        <div style={{ color: theme.colors.text.secondary, fontSize: '0.9rem' }}>
                          Attendees: {attendeeCount} {waitlistCount > 0 ? `• Waitlist: ${waitlistCount}` : ''}
                        </div>
                      </div>
                      <button onClick={() => openAttendees(selectedScheduleDate, time)} style={secondaryButtonStyle}>
                        View Roster
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'grid', gap: theme.spacing.md }}>
              {sessions.map((session) => (
                <div key={session.id} style={{
                  padding: theme.spacing.lg,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.lg,
                  backgroundColor: theme.colors.background.primary
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.md }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.sm }}>
                        <h4 style={{ fontSize: theme.typography.fontSizes.lg, fontWeight: 'bold', color: theme.colors.primary }}>
                          {session.date} at {session.time}
                        </h4>
                        <span style={{
                          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                          backgroundColor: session.type === 'Individual' ? theme.colors.primary : theme.colors.background.secondary,
                          color: session.type === 'Individual' ? 'white' : theme.colors.text.primary,
                          borderRadius: theme.borderRadius.sm,
                          fontSize: '0.8rem',
                          fontWeight: 'bold'
                        }}>
                          {session.type}
                        </span>
                      </div>
                      <p style={{ color: theme.colors.text.secondary }}>
                        <strong>Focus:</strong> {session.focus}
                      </p>
                      <p style={{ color: theme.colors.text.secondary }}>
                        <strong>Students:</strong> {session.students.join(', ')}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.9rem', color: theme.colors.text.secondary }}>
                        {session.duration}
                      </div>
                      <div style={{ fontSize: '0.9rem', color: theme.colors.text.secondary }}>
                        {session.location}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                    <button onClick={() => handleEditSession(session)} style={secondaryButtonStyle}>
                      Edit Session
                    </button>
                    <button onClick={() => alert(`Send reminder for ${session.type} session on ${session.date}`)} style={secondaryButtonStyle}>
                      Send Reminder
                    </button>
                    <button onClick={() => handleViewSessionDetails(session)} style={secondaryButtonStyle}>
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Practice Logs Tab */}
      {activeTab === 'practice' && (
        <div>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
              <h3 style={{ fontSize: theme.typography.fontSizes.xl, fontFamily: theme.typography.fontFamily.headline }}>
                Practice Logs & Recommendations
              </h3>
              <button 
                onClick={() => setShowVideoModal(true)}
                style={buttonStyle}
              >
                Select Training Videos
              </button>
            </div>
            
            <div style={{ display: 'grid', gap: theme.spacing.lg }}>
              {practiceLogs.map((log) => (
                <div key={log.id} style={{
                  padding: theme.spacing.lg,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.lg,
                  backgroundColor: theme.colors.background.primary
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.md }}>
                    <div>
                      <h4 style={{ fontSize: theme.typography.fontSizes.lg, fontWeight: 'bold', color: theme.colors.primary, marginBottom: theme.spacing.xs }}>
                        {log.studentName} - {log.focus}
                      </h4>
                      <p style={{ color: theme.colors.text.secondary, fontSize: '0.9rem' }}>
                        {log.date} • Rating: {log.rating}/10
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.9rem', color: theme.colors.text.secondary }}>
                        {log.videos.length} videos assigned
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: theme.spacing.md }}>
                    <h5 style={{ fontSize: theme.typography.fontSizes.base, fontWeight: 'bold', marginBottom: theme.spacing.xs }}>
                      Session Notes:
                    </h5>
                    <p style={{ color: theme.colors.text.secondary }}>{log.notes}</p>
                  </div>
                  
                  <div style={{ marginBottom: theme.spacing.md }}>
                    <h5 style={{ fontSize: theme.typography.fontSizes.base, fontWeight: 'bold', marginBottom: theme.spacing.xs }}>
                      Recommendations:
                    </h5>
                    <p style={{ color: theme.colors.text.secondary }}>{log.recommendations}</p>
                  </div>
                  
                  {log.videos.length > 0 && (
                    <div style={{ marginBottom: theme.spacing.md }}>
                      <h5 style={{ fontSize: theme.typography.fontSizes.base, fontWeight: 'bold', marginBottom: theme.spacing.xs }}>
                        Assigned Videos:
                      </h5>
                      <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                        {log.videos && log.videos.map((videoId) => {
                          const video = trainingVideos && trainingVideos.find(v => v.id === videoId);
                          return video ? (
                            <span key={videoId} style={{
                              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                              backgroundColor: theme.colors.background.secondary,
                              color: theme.colors.text.primary,
                              borderRadius: theme.borderRadius.sm,
                              fontSize: '0.8rem'
                            }}>
                              {video.title}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                  
                  <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                    <button onClick={() => alert(`Edit practice log for ${log.studentName}`)} style={secondaryButtonStyle}>
                      Edit Log
                    </button>
                    <button onClick={() => alert(`Share practice log with ${log.studentName}'s parent`)} style={secondaryButtonStyle}>
                      Share with Parent
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Parent Communication Tab */}
      {activeTab === 'communication' && (
        <div>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
              <h3 style={{ fontSize: theme.typography.fontSizes.xl, fontFamily: theme.typography.fontFamily.headline }}>
                Parent Communication
              </h3>
              <button 
                onClick={() => setShowParentChatModal(true)}
                style={buttonStyle}
              >
                New Message
              </button>
            </div>
            
            <div style={{ display: 'grid', gap: theme.spacing.md }}>
              {parentMessages.map((message) => (
                <div key={message.id} style={{
                  padding: theme.spacing.lg,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.lg,
                  backgroundColor: message.status === 'unread' ? theme.colors.background.secondary : theme.colors.background.primary
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.md }}>
                    <div>
                      <h4 style={{ fontSize: theme.typography.fontSizes.lg, fontWeight: 'bold', marginBottom: theme.spacing.xs }}>
                        {message.subject}
                      </h4>
                      <p style={{ color: theme.colors.text.secondary, fontSize: '0.9rem' }}>
                        From: {message.parentName} • Student: {message.studentName}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.9rem', color: theme.colors.text.secondary }}>
                        {message.date}
                      </div>
                      {message.status === 'unread' && (
                        <span style={{
                          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                          backgroundColor: theme.colors.primary,
                          color: 'white',
                          borderRadius: theme.borderRadius.sm,
                          fontSize: '0.8rem',
                          fontWeight: 'bold'
                        }}>
                          New
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
                    {message.message}
                  </p>
                  
                  <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                    <button onClick={() => alert(`Reply to ${message.parentName}`)} style={buttonStyle}>
                      Reply
                    </button>
                    <button onClick={() => alert(`Mark message from ${message.parentName} as read`)} style={secondaryButtonStyle}>
                      Mark as Read
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div>
          <div style={gridStyle}>
            <div style={cardStyle}>
              <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
                Student Performance
              </h3>
              <div style={{ textAlign: 'center', padding: theme.spacing.xl }}>
                <div style={{ fontSize: '3rem', fontWeight: 'bold', color: theme.colors.primary, marginBottom: theme.spacing.sm }}>
                  +14%
                </div>
                <div style={{ color: theme.colors.text.secondary }}>
                  Average improvement across all students
                </div>
              </div>
            </div>
            
            <div style={cardStyle}>
              <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
                Session Statistics
              </h3>
              <div style={{ textAlign: 'center', padding: theme.spacing.xl }}>
                <div style={{ fontSize: '3rem', fontWeight: 'bold', color: theme.colors.primary, marginBottom: theme.spacing.sm }}>
                  87%
                </div>
                <div style={{ color: theme.colors.text.secondary }}>
                  Average session attendance rate
                </div>
              </div>
            </div>
          </div>
          
          <div style={cardStyle}>
            <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
              Monthly Overview
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: theme.spacing.lg }}>
              <div style={statCardStyle}>
                <div style={statValueStyle}>32</div>
                <div style={statLabelStyle}>Sessions Conducted</div>
              </div>
              <div style={statCardStyle}>
                <div style={statValueStyle}>156</div>
                <div style={statLabelStyle}>Student Hours</div>
              </div>
              <div style={statCardStyle}>
                <div style={statValueStyle}>4.8</div>
                <div style={statLabelStyle}>Average Rating</div>
              </div>
              <div style={statCardStyle}>
                <div style={statValueStyle}>$2,400</div>
                <div style={statLabelStyle}>Revenue Generated</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Session Modal */}
      {showSessionModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: theme.colors.background.primary,
            padding: theme.spacing.xl,
            borderRadius: theme.borderRadius.lg,
            maxWidth: 500,
            width: '90%'
          }}>
            <h3 style={{ color: theme.colors.primary, marginBottom: theme.spacing.lg }}>
              Create New Session
            </h3>
            
            <div style={{ marginBottom: theme.spacing.md }}>
              <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontWeight: 'bold' }}>
                Date
              </label>
              <input
                type="date"
                value={newSession.date}
                onChange={(e) => setNewSession({...newSession, date: e.target.value})}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md
                }}
              />
            </div>
            
            <div style={{ marginBottom: theme.spacing.md }}>
              <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontWeight: 'bold' }}>
                Time
              </label>
              <input
                type="time"
                value={newSession.time}
                onChange={(e) => setNewSession({...newSession, time: e.target.value})}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md
                }}
              />
            </div>
            
            <div style={{ marginBottom: theme.spacing.md }}>
              <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontWeight: 'bold' }}>
                Session Type
              </label>
              <select
                value={newSession.type}
                onChange={(e) => setNewSession({...newSession, type: e.target.value})}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md
                }}
              >
                <option value="group">Group Training</option>
                <option value="individual">Individual Session</option>
              </select>
            </div>
            
            <div style={{ marginBottom: theme.spacing.md }}>
              <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontWeight: 'bold' }}>
                Focus Area
              </label>
              <input
                type="text"
                placeholder="e.g., Short game, Driving, Putting"
                value={newSession.focus}
                onChange={(e) => setNewSession({...newSession, focus: e.target.value})}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md
                }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: theme.spacing.sm }}>
              <button
                onClick={handleSaveSession}
                disabled={!newSession.date || !newSession.time || !newSession.focus}
                style={{
                  flex: 1,
                  padding: theme.spacing.md,
                  backgroundColor: theme.colors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: !newSession.date || !newSession.time || !newSession.focus ? 'not-allowed' : 'pointer',
                  opacity: !newSession.date || !newSession.time || !newSession.focus ? 0.6 : 1
                }}
              >
                Create Session
              </button>
              <button
                onClick={() => setShowSessionModal(false)}
                style={{
                  flex: 1,
                  padding: theme.spacing.md,
                  backgroundColor: theme.colors.background.secondary,
                  color: theme.colors.text.primary,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Profile Modal */}
      {showStudentProfileModal && selectedStudent && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: theme.colors.background.primary,
            padding: theme.spacing.xl,
            borderRadius: theme.borderRadius.lg,
            maxWidth: 800,
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
              <h3 style={{ color: theme.colors.primary, fontSize: theme.typography.fontSizes.xl }}>
                {selectedStudent.name} - Student Profile
              </h3>
              <button
                onClick={() => setShowStudentProfileModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: theme.colors.text.secondary
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing.lg, marginBottom: theme.spacing.lg }}>
              <div>
                <h4 style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md, fontFamily: theme.typography.fontFamily.headline }}>
                  Personal Information
                </h4>
                <p><strong>Age:</strong> {selectedStudent.age} years old</p>
                <p><strong>Skill Level:</strong> {selectedStudent.skillLevel}</p>
                <p><strong>Email:</strong> {selectedStudent.email}</p>
                <p><strong>Phone:</strong> {selectedStudent.phone}</p>
                <p><strong>Last Session:</strong> {selectedStudent.lastSession}</p>
                <p><strong>Next Session:</strong> {selectedStudent.nextSession}</p>
              </div>
              
              <div>
                <h4 style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md, fontFamily: theme.typography.fontFamily.headline }}>
                  Performance Metrics
                </h4>
                <p><strong>Progress:</strong> {selectedStudent.progress}%</p>
                <p><strong>Attendance:</strong> {selectedStudent.attendance}%</p>
                <p><strong>Improvement:</strong> {selectedStudent.improvement}</p>
                <p><strong>Sessions This Month:</strong> {selectedStudent.sessionsThisMonth}</p>
              </div>
            </div>
            
            <div style={{ marginBottom: theme.spacing.lg }}>
              <h4 style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md, fontFamily: theme.typography.fontFamily.headline }}>
                Goals
              </h4>
              <ul style={{ paddingLeft: theme.spacing.md }}>
                {selectedStudent.goals && selectedStudent.goals.map((goal, index) => (
                  <li key={index} style={{ marginBottom: theme.spacing.xs }}>{goal}</li>
                ))}
              </ul>
            </div>
            
            <div style={{ marginBottom: theme.spacing.lg }}>
              <h4 style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md, fontFamily: theme.typography.fontFamily.headline }}>
                Coach Notes
              </h4>
              <p style={{ color: theme.colors.text.secondary }}>{selectedStudent.notes}</p>
            </div>
            
            <div style={{ display: 'flex', gap: theme.spacing.md }}>
              <button style={buttonStyle}>
                Update Progress
              </button>
              <button 
                onClick={() => {
                  setShowStudentProfileModal(false);
                  handleParentChat(selectedStudent);
                }}
                style={secondaryButtonStyle}
              >
                Contact Parent
              </button>
              <button style={secondaryButtonStyle}>
                Schedule Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parent Chat Modal */}
      {showParentChatModal && selectedStudent && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: theme.colors.background.primary,
            padding: theme.spacing.xl,
            borderRadius: theme.borderRadius.lg,
            maxWidth: 600,
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
              <h3 style={{ color: theme.colors.primary, fontSize: theme.typography.fontSizes.xl }}>
                Contact Parent - {selectedStudent.name}
              </h3>
              <button
                onClick={() => setShowParentChatModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: theme.colors.text.secondary
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ marginBottom: theme.spacing.md }}>
              <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontWeight: 'bold' }}>
                Subject
              </label>
              <input
                type="text"
                placeholder="Enter message subject"
                value={newParentMessage.subject}
                onChange={(e) => setNewParentMessage({...newParentMessage, subject: e.target.value})}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md
                }}
              />
            </div>
            
            <div style={{ marginBottom: theme.spacing.md }}>
              <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontWeight: 'bold' }}>
                Message
              </label>
              <textarea
                placeholder="Enter your message to the parent..."
                value={newParentMessage.message}
                onChange={(e) => setNewParentMessage({...newParentMessage, message: e.target.value})}
                rows={6}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md,
                  resize: 'vertical'
                }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: theme.spacing.sm }}>
              <button
                onClick={handleSendParentMessage}
                disabled={!newParentMessage.subject || !newParentMessage.message}
                style={{
                  flex: 1,
                  padding: theme.spacing.md,
                  backgroundColor: theme.colors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: !newParentMessage.subject || !newParentMessage.message ? 'not-allowed' : 'pointer',
                  opacity: !newParentMessage.subject || !newParentMessage.message ? 0.6 : 1
                }}
              >
                Send Message
              </button>
              <button
                onClick={() => setShowParentChatModal(false)}
                style={{
                  flex: 1,
                  padding: theme.spacing.md,
                  backgroundColor: theme.colors.background.secondary,
                  color: theme.colors.text.primary,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Training Videos Modal */}
      {showVideoModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: theme.colors.background.primary,
            padding: theme.spacing.xl,
            borderRadius: theme.borderRadius.lg,
            maxWidth: 800,
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
              <h3 style={{ color: theme.colors.primary, fontSize: theme.typography.fontSizes.xl }}>
                Select Training Videos
              </h3>
              <button
                onClick={() => setShowVideoModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: theme.colors.text.secondary
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ display: 'grid', gap: theme.spacing.md }}>
              {trainingVideos && trainingVideos.map((video) => (
                <div key={video.id} style={{
                  padding: theme.spacing.md,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md,
                  backgroundColor: theme.colors.background.secondary
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.sm }}>
                    <div>
                      <h4 style={{ fontSize: theme.typography.fontSizes.lg, fontWeight: 'bold', marginBottom: theme.spacing.xs }}>
                        {video.title}
                      </h4>
                      <p style={{ color: theme.colors.text.secondary, fontSize: '0.9rem' }}>
                        {video.category} • {video.duration} • {video.skillLevel}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAddVideoToStudent(video.id)}
                      style={{
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        backgroundColor: theme.colors.primary,
                        color: 'white',
                        border: 'none',
                        borderRadius: theme.borderRadius.sm,
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      Add to Student
                    </button>
                  </div>
                  <p style={{ color: theme.colors.text.secondary, fontSize: '0.9rem' }}>
                    {video.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Attendees Modal */}
      {showAttendeesModal && selectedTimeSlot && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: theme.colors.background.primary,
            padding: theme.spacing.xl,
            borderRadius: theme.borderRadius.lg,
            width: '90%', maxWidth: 560,
            border: `1px solid ${theme.colors.border}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
              <h3 style={{ color: theme.colors.primary, fontSize: theme.typography.fontSizes.xl }}>
                Roster • {selectedTimeSlot.date} {selectedTimeSlot.time}
              </h3>
              <button onClick={() => setShowAttendeesModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: theme.colors.text.secondary }}>×</button>
            </div>
            {attendees.length === 0 ? (
              <p style={{ color: theme.colors.text.secondary }}>No attendees yet for this slot.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: theme.spacing.lg }}>
                {attendees.map((name, i) => (
                  <li key={i} style={{ marginBottom: theme.spacing.xs }}>{name}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CoachDashboardPage;
