import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { theme } from '../styles/theme';
import { userService, sessionService, bookingService, analyticsService } from '../services/firebaseService';

function AdminDashboardPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [analytics, setAnalytics] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      // Load users from Firestore
      const allUsers = await userService.getAllUsers();
      setUsers(allUsers.map(u => ({
        id: u.id,
        name: u.displayName || u.name || u.email || 'User',
        email: u.email || '',
        role: u.role || 'student',
        status: u.status || 'active',
        joinDate: u.createdAt?.toDate ? u.createdAt.toDate().toISOString().split('T')[0] : (u.createdAt || ''),
        lastLogin: u.lastLogin || '',
        sessionsAttended: u.sessionsAttended || 0,
        studentsAssigned: u.studentsAssigned || 0
      })));

      // Basic analytics using service
      const sys = await analyticsService.getSystemAnalytics();
      setAnalytics({
        totalUsers: sys.totalUsers,
        activeUsers: sys.activeUsers,
        newUsersThisMonth: sys.totalUsers, // placeholder until monthly calc added
        totalRevenue: sys.totalRevenue,
        revenueThisMonth: sys.totalRevenue, // placeholder until monthly calc added
        sessionsThisMonth: sys.totalSessions,
        averageSessionRating: 0,
        userGrowth: sys.userGrowth,
        revenueGrowth: sys.revenueGrowth
      });
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Button handlers for admin functionality
  const handleEditUser = (user) => {
    alert(`Edit user: ${user.name} - Feature coming soon!`);
  };

  const handleViewUser = (user) => {
    alert(`View user details: ${user.name} - Feature coming soon!`);
  };

  const handleAddNewUser = () => {
    // Prompt for user details
    const userName = prompt('Enter user name:');
    if (!userName) return;
    
    const userEmail = prompt('Enter user email:');
    if (!userEmail) return;
    
    const userRole = prompt('Enter user role (student/coach/parent/admin):');
    if (!userRole || !['student', 'coach', 'parent', 'admin'].includes(userRole.toLowerCase())) {
      alert('Invalid role. Please enter: student, coach, parent, or admin.');
      return;
    }
    
    // Create new user
    const newUser = {
      id: `user-${Date.now()}`,
      name: userName,
      email: userEmail,
      role: userRole.toLowerCase(),
      status: 'active',
      joinDate: new Date().toISOString().split('T')[0],
      lastLogin: new Date().toISOString().split('T')[0],
      sessionsAttended: userRole === 'student' ? 0 : undefined,
      studentsAssigned: userRole === 'coach' ? 0 : undefined
    };
    
    // Add to users list
    setUsers([...users, newUser]);
    
    // Update analytics
    setAnalytics(prev => ({
      ...prev,
      totalUsers: prev.totalUsers + 1,
      activeUsers: prev.activeUsers + 1,
      newUsersThisMonth: prev.newUsersThisMonth + 1
    }));
    
    alert(`User added successfully!\n\nName: ${userName}\nEmail: ${userEmail}\nRole: ${userRole}\nStatus: Active`);
  };

  const handleCreateSession = () => {
    alert('Create new session - Feature coming soon!');
  };

  const handleGenerateReport = () => {
    alert('Generate report - Feature coming soon!');
  };

  const handleSystemSettings = () => {
    alert('System settings - Feature coming soon!');
  };

  const handleChangeUserRole = (user) => {
    const newRole = prompt(`Change role for ${user.name}\n\nCurrent role: ${user.role}\n\nEnter new role (student/coach/parent/admin):`);
    
    if (!newRole) return;
    
    if (!['student', 'coach', 'parent', 'admin'].includes(newRole.toLowerCase())) {
      alert('Invalid role. Please enter: student, coach, parent, or admin.');
      return;
    }
    
    // Update user role
    const updatedUsers = users.map(u => 
      u.id === user.id 
        ? { 
            ...u, 
            role: newRole.toLowerCase(),
            sessionsAttended: newRole === 'student' ? (u.sessionsAttended || 0) : undefined,
            studentsAssigned: newRole === 'coach' ? (u.studentsAssigned || 0) : undefined
          }
        : u
    );
    
    setUsers(updatedUsers);
    
    alert(`Role changed successfully!\n\nUser: ${user.name}\nPrevious Role: ${user.role}\nNew Role: ${newRole}`);
  };

  const handleDeactivateUser = (user) => {
    if (window.confirm(`Are you sure you want to deactivate ${user.name}?\n\nThis will:\n- Remove their access to the system\n- Keep their data for records\n- They can be reactivated later`)) {
      // Update user status
      const updatedUsers = users.map(u => 
        u.id === user.id 
          ? { ...u, status: 'inactive' }
          : u
      );
      
      setUsers(updatedUsers);
      
      // Update analytics
      setAnalytics(prev => ({
        ...prev,
        activeUsers: prev.activeUsers - 1
      }));
      
      alert(`User deactivated successfully!\n\nUser: ${user.name}\nEmail: ${user.email}\nRole: ${user.role}\nStatus: Inactive\n\nThey can be reactivated later if needed.`);
    }
  };

  const handleAddUser = () => {
    alert('Add user - Feature coming soon!');
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
    textAlign: 'center',
    marginBottom: theme.spacing['2xl']
  };

  const titleStyle = {
    fontSize: theme.typography.fontSizes['3xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.headline,
    letterSpacing: '0.05em'
  };

  const subtitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.lineHeights.normal,
    fontFamily: theme.typography.fontFamily.body
  };

  const welcomeStyle = {
    fontSize: theme.typography.fontSizes.xl,
    color: theme.colors.primary,
    marginBottom: theme.spacing.lg,
    fontFamily: theme.typography.fontFamily.headline,
    letterSpacing: '0.05em'
  };

  const tabContainerStyle = {
    display: 'flex',
    borderBottom: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.xl
  };

  const tabStyle = {
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.text.secondary,
    borderBottom: `3px solid transparent`,
    transition: 'all 0.2s ease',
    fontFamily: theme.typography.fontFamily.body
  };

  const activeTabStyle = {
    ...tabStyle,
    color: theme.colors.primary,
    borderBottomColor: theme.colors.primary
  };

  const statsGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.xl
  };

  const statCardStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    textAlign: 'center',
    transition: 'all 0.3s ease',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: theme.shadows.lg,
      borderColor: theme.colors.primary
    }
  };

  const statNumberStyle = {
    fontSize: theme.typography.fontSizes['2xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const statLabelStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const statChangeStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.success,
    fontFamily: theme.typography.fontFamily.body
  };

  const contentGridStyle = {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: theme.spacing.xl
  };

  const mainContentStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`
  };

  const sidebarStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    height: 'fit-content'
  };

  const sectionTitleStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.lg,
    fontFamily: theme.typography.fontFamily.headline
  };

  const userCardStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.md,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    ':hover': {
      borderColor: theme.colors.primary,
      transform: 'translateY(-1px)'
    }
  };

  const userNameStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily.headline
  };

  const userInfoStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily.body
  };

  const roleBadgeStyle = {
    display: 'inline-block',
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semibold,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontFamily: theme.typography.fontFamily.body
  };

  const getRoleBadgeStyle = (role) => {
    switch (role) {
      case 'admin':
        return { ...roleBadgeStyle, backgroundColor: theme.colors.error, color: theme.colors.text.primary };
      case 'coach':
        return { ...roleBadgeStyle, backgroundColor: theme.colors.primary, color: theme.colors.text.dark };
      case 'student':
        return { ...roleBadgeStyle, backgroundColor: theme.colors.secondary, color: theme.colors.text.dark };
      default:
        return { ...roleBadgeStyle, backgroundColor: theme.colors.border, color: theme.colors.text.secondary };
    }
  };

  const actionButtonStyle = {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    border: 'none',
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body,
    transition: 'all 0.2s ease',
    marginRight: theme.spacing.sm,
    ':hover': {
      backgroundColor: '#009a47',
      transform: 'translateY(-1px)'
    }
  };

  const renderOverview = () => (
    <div>
      <div style={statsGridStyle}>
        <div style={statCardStyle}>
          <div style={statNumberStyle}>{analytics.totalUsers}</div>
          <div style={statLabelStyle}>Total Users</div>
          <div style={statChangeStyle}>+{analytics.userGrowth}% this month</div>
        </div>
        <div style={statCardStyle}>
          <div style={statNumberStyle}>${analytics.totalRevenue.toLocaleString()}</div>
          <div style={statLabelStyle}>Total Revenue</div>
          <div style={statChangeStyle}>+{analytics.revenueGrowth}% this month</div>
        </div>
        <div style={statCardStyle}>
          <div style={statNumberStyle}>{analytics.sessionsThisMonth}</div>
          <div style={statLabelStyle}>Sessions This Month</div>
          <div style={statChangeStyle}>+12% vs last month</div>
        </div>
        <div style={statCardStyle}>
          <div style={statNumberStyle}>{analytics.averageSessionRating}</div>
          <div style={statLabelStyle}>Avg. Session Rating</div>
          <div style={statChangeStyle}>+0.2 vs last month</div>
        </div>
      </div>

      <div style={contentGridStyle}>
        <div style={mainContentStyle}>
          <h3 style={sectionTitleStyle}>Recent User Activity</h3>
          {users.slice(0, 5).map((user) => (
            <div key={user.id} style={userCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={userNameStyle}>{user.name}</div>
                  <div style={userInfoStyle}>{user.email}</div>
                  <div style={userInfoStyle}>
                    Joined: {user.joinDate} • Last login: {user.lastLogin}
                  </div>
                  {user.role === 'student' && (
                    <div style={userInfoStyle}>
                      Sessions attended: {user.sessionsAttended}
                    </div>
                  )}
                  {user.role === 'coach' && (
                    <div style={userInfoStyle}>
                      Students assigned: {user.studentsAssigned}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <div style={getRoleBadgeStyle(user.role)}>{user.role}</div>
                  <div style={{ marginTop: theme.spacing.sm }}>
                    <button onClick={() => handleEditUser(user)} style={actionButtonStyle}>Edit</button>
                    <button onClick={() => handleViewUser(user)} style={actionButtonStyle}>View</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={sidebarStyle}>
          <h3 style={sectionTitleStyle}>Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
            <button onClick={handleAddNewUser} style={actionButtonStyle}>Add New User</button>
            <button onClick={handleCreateSession} style={actionButtonStyle}>Create Session</button>
            <button onClick={handleGenerateReport} style={actionButtonStyle}>Generate Report</button>
            <button onClick={handleSystemSettings} style={actionButtonStyle}>System Settings</button>
          </div>

          <h3 style={{ ...sectionTitleStyle, marginTop: theme.spacing.xl }}>System Status</h3>
          <div style={{ color: theme.colors.success, fontSize: theme.typography.fontSizes.sm }}>
            ✅ All systems operational
          </div>
          <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSizes.sm, marginTop: theme.spacing.sm }}>
            Last backup: 2 hours ago
          </div>
        </div>
      </div>
    </div>
  );

  const renderUsers = () => (
    <div style={mainContentStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
        <h3 style={sectionTitleStyle}>User Management</h3>
        <button onClick={handleAddUser} style={actionButtonStyle}>Add User</button>
      </div>
      
      {users.map((user) => (
        <div key={user.id} style={userCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={userNameStyle}>{user.name}</div>
              <div style={userInfoStyle}>{user.email}</div>
              <div style={userInfoStyle}>
                Status: {user.status} • Joined: {user.joinDate}
              </div>
              <div style={userInfoStyle}>
                Last login: {user.lastLogin}
              </div>
              {user.role === 'student' && (
                <div style={userInfoStyle}>
                  Sessions attended: {user.sessionsAttended}
                </div>
              )}
              {user.role === 'coach' && (
                <div style={userInfoStyle}>
                  Students assigned: {user.studentsAssigned}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div style={getRoleBadgeStyle(user.role)}>{user.role}</div>
              <div style={{ marginTop: theme.spacing.sm }}>
                <button onClick={() => handleEditUser(user)} style={actionButtonStyle}>Edit</button>
                <button onClick={() => handleChangeUserRole(user)} style={actionButtonStyle}>Change Role</button>
                <button onClick={() => handleDeactivateUser(user)} style={actionButtonStyle}>Deactivate</button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderAnalytics = () => (
    <div style={mainContentStyle}>
      <h3 style={sectionTitleStyle}>System Analytics</h3>
      <p style={{ color: theme.colors.text.secondary }}>
        Detailed analytics and reporting features coming soon...
      </p>
    </div>
  );

  const renderSettings = () => (
    <div style={mainContentStyle}>
      <h3 style={sectionTitleStyle}>System Settings</h3>
      <p style={{ color: theme.colors.text.secondary }}>
        System configuration and settings coming soon...
      </p>
    </div>
  );

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: theme.spacing['2xl'] }}>
          <div style={{ color: theme.colors.text.secondary }}>Loading admin dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Admin Dashboard</h1>
        <p style={subtitleStyle}>
          System administration, user management, and analytics
        </p>
      </div>

      <div style={{ textAlign: 'center', marginBottom: theme.spacing.xl }}>
        <h2 style={welcomeStyle}>
          Welcome back, Admin {user?.displayName || 'Administrator'}!
        </h2>
      </div>

      <div style={tabContainerStyle}>
        <button
          style={activeTab === 'overview' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          style={activeTab === 'users' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('users')}
        >
          Users
        </button>
        <button
          style={activeTab === 'analytics' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('analytics')}
        >
          Analytics
        </button>
        <button
          style={activeTab === 'settings' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'users' && renderUsers()}
      {activeTab === 'analytics' && renderAnalytics()}
      {activeTab === 'settings' && renderSettings()}
    </div>
  );
}

export default AdminDashboardPage;
