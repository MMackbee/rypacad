import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { theme } from '../styles/theme';
import { familyService } from '../services/familyService';
import { userService } from '../services/firebaseService';

function ParentDashboardPage() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState('overview');
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [childAccountSummary, setChildAccountSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fundingAmount, setFundingAmount] = useState('');
  const [showFundingModal, setShowFundingModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [linkStudentId, setLinkStudentId] = useState('');
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    loadParentData();
  }, []);

  const loadParentData = async () => {
    setLoading(true);
    try {
      // Mock data for parent dashboard
      const mockChildren = [
        {
          id: 'child-1',
          displayName: 'Alex Johnson',
          email: 'alex.johnson@email.com',
          age: 15,
          skillLevel: 'Intermediate',
          joinedDate: '2024-01-01',

          sessionsAttended: 24,
          currentPackage: 'Developer',
          progress: 75,
          attendance: 85,
          improvement: '+12%',
          nextSession: '2024-01-25',
          coach: 'Coach Mike'
        },
        {
          id: 'child-2',
          displayName: 'Emma Johnson',
          email: 'emma.johnson@email.com',
          age: 12,
          skillLevel: 'Beginner',
          joinedDate: '2024-01-15',

          sessionsAttended: 16,
          currentPackage: 'Starter',
          progress: 45,
          attendance: 92,
          improvement: '+18%',
          nextSession: '2024-01-26',
          coach: 'Coach Sarah'
        }
      ];
      
      setChildren(mockChildren);
      if (mockChildren.length > 0) {
        setSelectedChild(mockChildren[0]);
        loadChildAccountSummary(mockChildren[0].id);
      }
    } catch (error) {
      console.error('Error loading parent data:', error);
      setChildren([]);
    }
    setLoading(false);
  };

  const loadChildAccountSummary = async (childId) => {
    try {
      const child = children.find(c => c.id === childId);
      if (!child) return;

      const mockSummary = {
        childProfile: child,
        tokenBalance: {
          groupSessions: 8,
          tournaments: 3,
          fitnessSessions: 4,
          mentalSessions: 2,
          history: [
            { type: 'add', tokenType: 'groupSessions', quantity: 8, source: 'package_purchase', timestamp: new Date() },
            { type: 'use', tokenType: 'groupSessions', quantity: 1, sessionId: 'session-123', timestamp: new Date() }
          ]
        },
        recentActivity: [
          { type: 'session_attended', description: 'Group Training Session', date: '2024-01-20' },
          { type: 'package_purchased', description: 'Developer Package', date: '2024-01-15' },
          { type: 'tournament_registered', description: 'Spring Championship', date: '2024-01-10' }
        ],
        upcomingSessions: [
          { date: '2024-01-25', time: '16:00', type: 'Group Training', coach: 'Coach Mike' },
          { date: '2024-01-28', time: '17:00', type: 'Individual Session', coach: 'Coach Sarah' }
        ],
        spendingHistory: [
          { date: '2024-01-15', amount: 380, description: 'Developer Package' },
          { date: '2024-01-10', amount: 120, description: 'Fitness Add-on' },
          { date: '2024-01-05', amount: 100, description: 'Mental Performance' }
        ]
      };
      
      setChildAccountSummary(mockSummary);
    } catch (error) {
      console.error('Error loading child account summary:', error);
    }
  };

  // Button handlers
  const handleFundChild = async () => {
    // Validate inputs
    if (!selectedChild) {
      alert('Please select a child first.');
      return;
    }

    if (!fundingAmount || parseFloat(fundingAmount) <= 0) {
      alert('Please enter a valid funding amount greater than $0.');
      return;
    }

    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update child's funding record
      const fundingRecord = {
        id: `funding-${Date.now()}`,
        childId: selectedChild.id,
        childName: selectedChild.displayName,
        amount: parseFloat(fundingAmount),
        date: new Date().toISOString().split('T')[0],
        status: 'completed'
      };
      
      // Add to spending history
      if (childAccountSummary) {
        const updatedHistory = [
          fundingRecord,
          ...childAccountSummary.spendingHistory
        ];
        setChildAccountSummary({
          ...childAccountSummary,
          spendingHistory: updatedHistory
        });
      }
      
      // Show success message
      alert(`Successfully funded $${fundingAmount} to ${selectedChild.displayName}'s account!\n\nTransaction ID: ${fundingRecord.id}\nDate: ${fundingRecord.date}`);
      
      // Reset form
      setShowFundingModal(false);
      setFundingAmount('');
    } catch (error) {
      alert('Error funding account: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchasePackage = async () => {
    // Validate inputs
    if (!selectedChild) {
      alert('Please select a child first.');
      return;
    }

    if (!selectedPackage) {
      alert('Please select a package to purchase.');
      return;
    }

    const total = calculateTotal();
    if (total <= 0) {
      alert('Please select a valid package.');
      return;
    }

    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Create purchase record
      const purchaseRecord = {
        id: `purchase-${Date.now()}`,
        childId: selectedChild.id,
        childName: selectedChild.displayName,
        package: selectedPackage.title,
        addOns: selectedAddOns.map(addOn => addOn.title),
        amount: total,
        date: new Date().toISOString().split('T')[0],
        status: 'completed'
      };
      
      // Add to spending history
      if (childAccountSummary) {
        const updatedHistory = [
          purchaseRecord,
          ...childAccountSummary.spendingHistory
        ];
        setChildAccountSummary({
          ...childAccountSummary,
          spendingHistory: updatedHistory
        });
      }
      
      // Update child's current package
      const updatedChildren = children.map(child => 
        child.id === selectedChild.id 
          ? { ...child, currentPackage: selectedPackage.title }
          : child
      );
      setChildren(updatedChildren);
      
      // Show success message
      const addOnsText = selectedAddOns.length > 0 ? `\nAdd-ons: ${selectedAddOns.map(a => a.title).join(', ')}` : '';
      alert(`Successfully purchased ${selectedPackage.title} package for ${selectedChild.displayName}!${addOnsText}\n\nTotal: $${total}\nTransaction ID: ${purchaseRecord.id}`);
      
      // Reset form
      setShowPurchaseModal(false);
      setSelectedPackage(null);
      setSelectedAddOns([]);
    } catch (error) {
      alert('Error purchasing package: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddOnSelection = (addOn) => {
    if (selectedAddOns.find(a => a.id === addOn.id)) {
      setSelectedAddOns(selectedAddOns.filter(a => a.id !== addOn.id));
    } else {
      setSelectedAddOns([...selectedAddOns, addOn]);
    }
  };

  const handleContactCoach = (child) => {
    alert(`Contact coach for ${child.displayName} - Feature coming soon!`);
  };

  const handleViewChildProgress = (child) => {
    alert(`View progress for ${child.displayName} - Feature coming soon!`);
  };

  const handleScheduleSession = (child) => {
    const target = child || selectedChild;
    if (!target) {
      alert('Please select a child first.');
      return;
    }
    alert(`Schedule session for ${target.displayName} - Feature coming soon!`);
  };

  const handleViewChildSchedule = (child) => {
    const target = child || selectedChild;
    if (!target) {
      alert('Please select a child first.');
      return;
    }
    alert(`View schedule for ${target.displayName} - Feature coming soon!`);
  };

  const handleAddChild = () => {
    alert('Add new child - Feature coming soon!');
  };

  const handleEditChildProfile = (child) => {
    alert(`Edit profile for ${child.displayName} - Feature coming soon!`);
  };

  const handleViewChildHistory = (child) => {
    alert(`View history for ${child.displayName} - Feature coming soon!`);
  };

  const handleLinkChildById = async () => {
    if (!linkStudentId) {
      alert('Please enter a student ID.');
      return;
    }
    setLinking(true);
    try {
      const child = await userService.getUserByStudentId(linkStudentId);
      if (!child) {
        alert('No student found with that ID.');
        setLinking(false);
        return;
      }
      await familyService.linkParentToChild(user.uid, child.id, 'parent');
      alert(`Linked ${child.displayName || child.email} to your account.`);
      // Refresh children list
      await loadParentData();
      setLinkStudentId('');
    } catch (e) {
      console.error(e);
      alert('Failed to link child.');
    } finally {
      setLinking(false);
    }
  };

  const calculateTotal = () => {
    let total = selectedPackage ? selectedPackage.price : 0;
    selectedAddOns.forEach(addOn => {
      total += addOn.standalonePrice;
    });
    return total;
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

  const buttonStyle = {
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    border: 'none',
    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.base,
    fontFamily: theme.typography.fontFamily.body,
    fontWeight: theme.typography.fontWeights.medium,
    transition: 'all 0.2s ease'
  };

  const secondaryButtonStyle = {
    backgroundColor: 'transparent',
    color: theme.colors.primary,
    border: `1px solid ${theme.colors.primary}`,
    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.base,
    fontFamily: theme.typography.fontFamily.body,
    fontWeight: theme.typography.fontWeights.medium,
    transition: 'all 0.2s ease'
  };

  const childCardStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  };

  const selectedChildCardStyle = {
    ...childCardStyle,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.background.secondary
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: theme.spacing['2xl'] }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: `4px solid ${theme.colors.border}`,
            borderTop: `4px solid ${theme.colors.primary}`,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <p>Loading parent dashboard...</p>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Parent Dashboard</h1>
        <p style={subtitleStyle}>
          Manage your children's golf training and progress
        </p>
      </div>

      <div style={tabContainerStyle}>
        <button
          style={activeTab === 'overview' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          style={activeTab === 'children' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('children')}
        >
          Children
        </button>
        <button
          style={activeTab === 'finances' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('finances')}
        >
          Finances
        </button>
        <button
          style={activeTab === 'communication' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('communication')}
        >
          Communication
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div>
          <div style={gridStyle}>
            <div style={cardStyle}>
              <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
                Quick Stats
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing.md }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: theme.typography.fontSizes['2xl'], fontWeight: 'bold', color: theme.colors.primary }}>
                    {children.length}
                  </div>
                  <div style={{ fontSize: theme.typography.fontSizes.sm, color: theme.colors.text.secondary }}>
                    Children Enrolled
                  </div>
                </div>
                                 <div style={{ textAlign: 'center' }}>
                   <div style={{ fontSize: theme.typography.fontSizes['2xl'], fontWeight: 'bold', color: theme.colors.primary }}>
                     {children.length}
                   </div>
                   <div style={{ fontSize: theme.typography.fontSizes.sm, color: theme.colors.text.secondary }}>
                     Active Children
                   </div>
                 </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: theme.typography.fontSizes['2xl'], fontWeight: 'bold', color: theme.colors.primary }}>
                    {children.reduce((sum, child) => sum + child.sessionsAttended, 0)}
                  </div>
                  <div style={{ fontSize: theme.typography.fontSizes.sm, color: theme.colors.text.secondary }}>
                    Sessions Attended
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: theme.typography.fontSizes['2xl'], fontWeight: 'bold', color: theme.colors.primary }}>
                    {children.length > 0 ? Math.round(children.reduce((sum, child) => sum + child.attendance, 0) / children.length) : 0}%
                  </div>
                  <div style={{ fontSize: theme.typography.fontSizes.sm, color: theme.colors.text.secondary }}>
                    Avg Attendance
                  </div>
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
                Quick Actions
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
                <button onClick={handleAddChild} style={buttonStyle}>
                  Add New Child
                </button>
                <button onClick={() => setShowFundingModal(true)} style={secondaryButtonStyle}>
                  Fund Child Account
                </button>
                <button onClick={() => setShowPurchaseModal(true)} style={secondaryButtonStyle}>
                  Purchase Package
                </button>
                <button onClick={() => alert('Contact Academy - Feature coming soon!')} style={secondaryButtonStyle}>
                  Contact Academy
                </button>
              </div>
            </div>
          </div>

          {/* Children Overview */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
              Your Children
            </h3>
            <div style={gridStyle}>
              {children.map((child) => (
                <div
                  key={child.id}
                  style={selectedChild?.id === child.id ? selectedChildCardStyle : childCardStyle}
                  onClick={() => {
                    setSelectedChild(child);
                    loadChildAccountSummary(child.id);
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.md }}>
                    <div>
                      <h4 style={{ fontSize: theme.typography.fontSizes.lg, fontWeight: 'bold', marginBottom: theme.spacing.xs }}>
                        {child.displayName}
                      </h4>
                      <p style={{ color: theme.colors.text.secondary, fontSize: '0.9rem' }}>
                        {child.age} years old • {child.skillLevel}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: theme.colors.primary }}>
                        {child.progress}%
                      </div>
                      <div style={{ fontSize: '0.8rem', color: theme.colors.text.secondary }}>
                        Progress
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
                    <div>
                      <div style={{ fontSize: '0.9rem', color: theme.colors.text.secondary }}>Attendance</div>
                      <div style={{ fontWeight: 'bold' }}>{child.attendance}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.9rem', color: theme.colors.text.secondary }}>Improvement</div>
                      <div style={{ fontWeight: 'bold', color: theme.colors.primary }}>{child.improvement}</div>
                    </div>
                  </div>
                  
                  <div style={{ fontSize: '0.9rem', color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
                    Next session: {child.nextSession}
                  </div>
                  
                  <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleContactCoach(child);
                      }}
                      style={buttonStyle}
                    >
                      Contact Coach
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewChildProgress(child);
                      }}
                      style={secondaryButtonStyle}
                    >
                      View Progress
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Children Tab */}
      {activeTab === 'children' && (
        <div>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
              <h3 style={{ fontSize: theme.typography.fontSizes.xl, fontFamily: theme.typography.fontFamily.headline }}>
                Child Management
              </h3>
              <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Enter Student ID"
                  value={linkStudentId}
                  onChange={(e) => setLinkStudentId(e.target.value)}
                  style={{ padding: theme.spacing.sm, border: `1px solid ${theme.colors.border}`, borderRadius: theme.borderRadius.md }}
                />
                <button onClick={handleLinkChildById} style={buttonStyle} disabled={linking}>
                  {linking ? 'Linking...' : 'Link Child'}
                </button>
              </div>
            </div>
            
            <div style={gridStyle}>
              {children.map((child) => (
                <div key={child.id} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.md }}>
                    <div>
                      <h4 style={{ fontSize: theme.typography.fontSizes.lg, fontWeight: 'bold', marginBottom: theme.spacing.xs }}>
                        {child.displayName}
                      </h4>
                      <p style={{ color: theme.colors.text.secondary, fontSize: '0.9rem' }}>
                        {child.email} • {child.age} years old
                      </p>
                      <p style={{ color: theme.colors.text.secondary, fontSize: '0.9rem' }}>
                        Skill Level: {child.skillLevel} • Coach: {child.coach}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: theme.colors.primary }}>
                        {child.sessionsAttended}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: theme.colors.text.secondary }}>
                        Sessions
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: theme.spacing.md }}>
                    <p><strong>Current Package:</strong> {child.currentPackage}</p>
                                         <p><strong>Current Package:</strong> {child.currentPackage}</p>
                    <p><strong>Joined:</strong> {child.joinedDate}</p>
                  </div>
                  
                  <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                    <button onClick={() => handleEditChildProfile(child)} style={buttonStyle}>
                      Edit Profile
                    </button>
                    <button onClick={() => handleViewChildProgress(child)} style={secondaryButtonStyle}>
                      View Progress
                    </button>
                    <button onClick={() => handleScheduleSession(child)} style={secondaryButtonStyle}>
                      Schedule Session
                    </button>
                    <button onClick={() => handleViewChildSchedule(child)} style={secondaryButtonStyle}>
                      View Schedule
                    </button>
                    <button onClick={() => handleViewChildHistory(child)} style={secondaryButtonStyle}>
                      View History
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Finances Tab */}
      {activeTab === 'finances' && (
        <div>
          <div style={gridStyle}>
            <div style={cardStyle}>
              <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
                Account Funding
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
                <button onClick={() => setShowFundingModal(true)} style={buttonStyle}>
                  Fund Child Account
                </button>
                <button onClick={() => setShowPurchaseModal(true)} style={buttonStyle}>
                  Purchase Package
                </button>
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
                Spending Summary
              </h3>
                             <div style={{ textAlign: 'center' }}>
                 <div style={{ fontSize: theme.typography.fontSizes['3xl'], fontWeight: 'bold', color: theme.colors.primary, marginBottom: theme.spacing.sm }}>
                   {children.reduce((sum, child) => sum + child.sessionsAttended, 0)}
                 </div>
                 <div style={{ color: theme.colors.text.secondary }}>
                   Total Sessions Attended
                 </div>
               </div>
            </div>
          </div>

          {childAccountSummary && (
            <div style={cardStyle}>
              <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
                Spending History - {selectedChild?.displayName}
              </h3>
              <div style={{ display: 'grid', gap: theme.spacing.md }}>
                {childAccountSummary.spendingHistory.map((item, index) => (
                  <div key={index} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: theme.spacing.md,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.borderRadius.md
                  }}>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{item.description}</div>
                      <div style={{ fontSize: '0.9rem', color: theme.colors.text.secondary }}>{item.date}</div>
                    </div>
                    <div style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                      ${item.amount}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Communication Tab */}
      {activeTab === 'communication' && (
        <div>
          <div style={cardStyle}>
            <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
              Communication Center
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
              <button onClick={() => alert('Contact Academy - Feature coming soon!')} style={buttonStyle}>
                Contact Academy
              </button>
              <button onClick={() => alert('Message Coaches - Feature coming soon!')} style={secondaryButtonStyle}>
                Message Coaches
              </button>
              <button onClick={() => alert('View Messages - Feature coming soon!')} style={secondaryButtonStyle}>
                View Messages
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Funding Modal */}
      {showFundingModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: theme.colors.background.primary,
            padding: theme.spacing.xl,
            borderRadius: theme.borderRadius.lg,
            maxWidth: '400px',
            width: '100%'
          }}>
            <h3 style={{ marginBottom: theme.spacing.lg }}>Fund Child Account</h3>
            <div style={{ marginBottom: theme.spacing.md }}>
              <label style={{ display: 'block', marginBottom: theme.spacing.sm }}>
                Amount ($):
              </label>
              <input
                type="number"
                value={fundingAmount}
                onChange={(e) => setFundingAmount(e.target.value)}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: theme.spacing.md }}>
              <button onClick={handleFundChild} style={buttonStyle} disabled={loading}>
                {loading ? 'Processing...' : 'Fund Account'}
              </button>
              <button onClick={() => setShowFundingModal(false)} style={secondaryButtonStyle}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Modal */}
      {showPurchaseModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: theme.colors.background.primary,
            padding: theme.spacing.xl,
            borderRadius: theme.borderRadius.lg,
            maxWidth: '500px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h3 style={{ marginBottom: theme.spacing.lg }}>Purchase Package</h3>
            
            <div style={{ marginBottom: theme.spacing.lg }}>
              <label style={{ display: 'block', marginBottom: theme.spacing.sm }}>
                Select Package:
              </label>
              <select
                value={selectedPackage?.id || ''}
                onChange={(e) => {
                  const packages = [
                    { id: 'starter', title: 'Starter Package', price: 200 },
                    { id: 'developer', title: 'Developer Package', price: 380 },
                    { id: 'premium', title: 'Premium Package', price: 600 }
                  ];
                  setSelectedPackage(packages.find(p => p.id === e.target.value));
                }}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md
                }}
              >
                <option value="">Select a package...</option>
                <option value="starter">Starter Package - $200</option>
                <option value="developer">Developer Package - $380</option>
                <option value="premium">Premium Package - $600</option>
              </select>
            </div>

            <div style={{ marginBottom: theme.spacing.lg }}>
              <label style={{ display: 'block', marginBottom: theme.spacing.sm }}>
                Add-ons:
              </label>
              {[
                { id: 'fitness', title: 'Fitness Training', standalonePrice: 120 },
                { id: 'mental', title: 'Mental Performance', standalonePrice: 100 },
                { id: 'tournament', title: 'Tournament Entry', standalonePrice: 80 }
              ].map(addOn => (
                <label key={addOn.id} style={{ display: 'flex', alignItems: 'center', marginBottom: theme.spacing.sm }}>
                  <input
                    type="checkbox"
                    checked={selectedAddOns.find(a => a.id === addOn.id) ? true : false}
                    onChange={() => handleAddOnSelection(addOn)}
                    style={{ marginRight: theme.spacing.sm }}
                  />
                  {addOn.title} - ${addOn.standalonePrice}
                </label>
              ))}
            </div>

            <div style={{ marginBottom: theme.spacing.lg, padding: theme.spacing.md, backgroundColor: theme.colors.background.secondary, borderRadius: theme.borderRadius.md }}>
              <strong>Total: ${calculateTotal()}</strong>
            </div>

            <div style={{ display: 'flex', gap: theme.spacing.md }}>
              <button onClick={handlePurchasePackage} style={buttonStyle} disabled={loading}>
                {loading ? 'Processing...' : 'Purchase'}
              </button>
              <button onClick={() => setShowPurchaseModal(false)} style={secondaryButtonStyle}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ParentDashboardPage;
