import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { familyService } from '../services/familyService';
import { theme } from '../styles/theme';

function ParentDashboard() {
  const { user } = useUser();
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [childAccountSummary, setChildAccountSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fundingAmount, setFundingAmount] = useState('');
  const [showFundingModal, setShowFundingModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (user) {
      loadChildren();
    }
  }, [user]);

  useEffect(() => {
    if (selectedChild) {
      loadChildAccountSummary(selectedChild.id);
    }
  }, [selectedChild]);

  const loadChildren = async () => {
    setLoading(true);
    try {
      // For demo purposes, create mock children if none exist
      const mockChildren = [
        {
          id: 'child-1',
          displayName: 'Alex Johnson',
          email: 'alex.johnson@email.com',
          age: 15,
          skillLevel: 'Intermediate',
          joinedDate: '2024-01-01',
          totalSpent: 1200,
          sessionsAttended: 24,
          currentPackage: 'Developer'
        },
        {
          id: 'child-2',
          displayName: 'Emma Johnson',
          email: 'emma.johnson@email.com',
          age: 12,
          skillLevel: 'Beginner',
          joinedDate: '2024-01-15',
          totalSpent: 800,
          sessionsAttended: 16,
          currentPackage: 'Starter'
        }
      ];
      
      setChildren(mockChildren);
      if (mockChildren.length > 0) {
        setSelectedChild(mockChildren[0]);
      }
    } catch (error) {
      console.error('Error loading children:', error);
    }
    setLoading(false);
  };

  const loadChildAccountSummary = async (childId) => {
    setLoading(true);
    try {
      // Mock account summary
      const mockSummary = {
        childProfile: children.find(child => child.id === childId),
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
    setLoading(false);
  };

  const handleFundChild = async () => {
    if (!selectedChild || !fundingAmount) return;

    setLoading(true);
    try {
      // Mock funding process
      setTimeout(() => {
        alert(`Successfully funded $${fundingAmount} to ${selectedChild.displayName}'s account`);
        setShowFundingModal(false);
        setFundingAmount('');
        loadChildAccountSummary(selectedChild.id);
        setLoading(false);
      }, 1000);
    } catch (error) {
      alert('Error funding account: ' + error.message);
      setLoading(false);
    }
  };

  const handlePurchasePackage = async () => {
    if (!selectedChild || !selectedPackage) return;

    setLoading(true);
    try {
      // Mock purchase process
      setTimeout(() => {
        alert(`Successfully purchased ${selectedPackage.title} package for ${selectedChild.displayName}`);
        setShowPurchaseModal(false);
        setSelectedPackage(null);
        setSelectedAddOns([]);
        loadChildAccountSummary(selectedChild.id);
        setLoading(false);
      }, 1000);
    } catch (error) {
      alert('Error purchasing package: ' + error.message);
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

  const calculateTotal = () => {
    let total = selectedPackage ? selectedPackage.price : 0;
    selectedAddOns.forEach(addOn => {
      total += addOn.standalonePrice;
    });
    return total;
  };

  const containerStyle = {
    maxWidth: '1200px',
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

  if (loading && children.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: theme.spacing.xl }}>
          Loading your family dashboard...
        </div>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Parent Dashboard</h1>
          <p style={subtitleStyle}>Manage your children's golf training</p>
        </div>
        
        <div style={cardStyle}>
          <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
            No Children Linked
          </h3>
          <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.lg }}>
            You haven't linked any children to your account yet. Contact support to link your child's account.
          </p>
          <button style={buttonStyle}>
            Contact Support
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Parent Dashboard</h1>
        <p style={subtitleStyle}>Manage your children's golf training and progress</p>
      </div>

      {/* Child Selection */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
          Select Child
        </h3>
        <div style={{ display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap' }}>
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setSelectedChild(child)}
              style={{
                padding: theme.spacing.md,
                backgroundColor: selectedChild?.id === child.id ? theme.colors.primary : theme.colors.background.primary,
                color: selectedChild?.id === child.id ? 'white' : theme.colors.text.primary,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
                fontSize: '1rem',
                minWidth: '200px'
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: theme.spacing.xs }}>
                {child.displayName}
              </div>
              <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                {child.age} years old • {child.skillLevel}
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedChild && (
        <>
          {/* Tabs */}
          <div style={tabContainerStyle}>
            <button
              style={activeTab === 'overview' ? activeTabStyle : tabStyle}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              style={activeTab === 'sessions' ? activeTabStyle : tabStyle}
              onClick={() => setActiveTab('sessions')}
            >
              Sessions
            </button>
            <button
              style={activeTab === 'spending' ? activeTabStyle : tabStyle}
              onClick={() => setActiveTab('spending')}
            >
              Spending
            </button>
            <button
              style={activeTab === 'actions' ? activeTabStyle : tabStyle}
              onClick={() => setActiveTab('actions')}
            >
              Actions
            </button>
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && childAccountSummary && (
            <div>
              <div style={gridStyle}>
                <div style={statCardStyle}>
                  <div style={statValueStyle}>{childAccountSummary.tokenBalance.groupSessions}</div>
                  <div style={statLabelStyle}>Group Sessions Remaining</div>
                </div>
                <div style={statCardStyle}>
                  <div style={statValueStyle}>{childAccountSummary.tokenBalance.tournaments}</div>
                  <div style={statLabelStyle}>Tournaments Remaining</div>
                </div>
                <div style={statCardStyle}>
                  <div style={statValueStyle}>{childAccountSummary.tokenBalance.fitnessSessions}</div>
                  <div style={statLabelStyle}>Fitness Sessions</div>
                </div>
                <div style={statCardStyle}>
                  <div style={statValueStyle}>{childAccountSummary.tokenBalance.mentalSessions}</div>
                  <div style={statLabelStyle}>Mental Sessions</div>
                </div>
              </div>

              <div style={gridStyle}>
                <div style={cardStyle}>
                  <h4 style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md, fontFamily: theme.typography.fontFamily.headline }}>
                    Recent Activity
                  </h4>
                  {childAccountSummary.recentActivity.map((activity, index) => (
                    <div key={index} style={{ 
                      padding: theme.spacing.sm, 
                      borderBottom: index < childAccountSummary.recentActivity.length - 1 ? `1px solid ${theme.colors.border}` : 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>{activity.description}</span>
                      <span style={{ fontSize: '0.9rem', color: theme.colors.text.secondary }}>
                        {activity.date}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={cardStyle}>
                  <h4 style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md, fontFamily: theme.typography.fontFamily.headline }}>
                    Upcoming Sessions
                  </h4>
                  {childAccountSummary.upcomingSessions.map((session, index) => (
                    <div key={index} style={{ 
                      padding: theme.spacing.sm, 
                      borderBottom: index < childAccountSummary.upcomingSessions.length - 1 ? `1px solid ${theme.colors.border}` : 'none'
                    }}>
                      <div style={{ fontWeight: 'bold' }}>{session.type}</div>
                      <div style={{ fontSize: '0.9rem', color: theme.colors.text.secondary }}>
                        {session.date} at {session.time} with {session.coach}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sessions Tab */}
          {activeTab === 'sessions' && (
            <div style={cardStyle}>
              <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
                Session Management
              </h3>
              <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.lg }}>
                View and manage your child's training sessions
              </p>
              <div style={{ display: 'flex', gap: theme.spacing.md }}>
                <button style={buttonStyle}>
                  View All Sessions
                </button>
                <button style={secondaryButtonStyle}>
                  Schedule New Session
                </button>
              </div>
            </div>
          )}

          {/* Spending Tab */}
          {activeTab === 'spending' && childAccountSummary && (
            <div>
              <div style={cardStyle}>
                <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
                  Spending History
                </h3>
                <div style={{ marginBottom: theme.spacing.lg }}>
                  <div style={{ fontSize: theme.typography.fontSizes.lg, fontWeight: 'bold', color: theme.colors.primary }}>
                    Total Spent: ${childAccountSummary.spendingHistory.reduce((sum, item) => sum + item.amount, 0)}
                  </div>
                </div>
                {childAccountSummary.spendingHistory.map((item, index) => (
                  <div key={index} style={{ 
                    padding: theme.spacing.md, 
                    borderBottom: index < childAccountSummary.spendingHistory.length - 1 ? `1px solid ${theme.colors.border}` : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{item.description}</div>
                      <div style={{ fontSize: '0.9rem', color: theme.colors.text.secondary }}>
                        {item.date}
                      </div>
                    </div>
                    <div style={{ fontSize: theme.typography.fontSizes.lg, fontWeight: 'bold' }}>
                      ${item.amount}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions Tab */}
          {activeTab === 'actions' && (
            <div style={gridStyle}>
              <div style={cardStyle}>
                <h4 style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md, fontFamily: theme.typography.fontFamily.headline }}>
                  Fund Account
                </h4>
                <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
                  Add funds to your child's account for future purchases
                </p>
                <button 
                  onClick={() => setShowFundingModal(true)}
                  style={buttonStyle}
                >
                  Fund Account
                </button>
              </div>

              <div style={cardStyle}>
                <h4 style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md, fontFamily: theme.typography.fontFamily.headline }}>
                  Purchase Package
                </h4>
                <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
                  Buy training packages and add-ons for your child
                </p>
                <button 
                  onClick={() => setShowPurchaseModal(true)}
                  style={buttonStyle}
                >
                  Purchase Package
                </button>
              </div>

              <div style={cardStyle}>
                <h4 style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md, fontFamily: theme.typography.fontFamily.headline }}>
                  View Progress
                </h4>
                <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
                  Track your child's training progress and achievements
                </p>
                <button style={buttonStyle}>
                  View Progress
                </button>
              </div>

              <div style={cardStyle}>
                <h4 style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md, fontFamily: theme.typography.fontFamily.headline }}>
                  Contact Coach
                </h4>
                <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
                  Get in touch with your child's coach for questions or concerns
                </p>
                <button style={buttonStyle}>
                  Contact Coach
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Funding Modal */}
      {showFundingModal && (
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
            borderRadius: theme.borderRadius.md,
            maxWidth: 400,
            width: '90%'
          }}>
            <h3 style={{ color: theme.colors.primary, marginBottom: theme.spacing.md }}>
              Fund {selectedChild?.displayName}'s Account
            </h3>
            <input
              type="number"
              placeholder="Amount ($)"
              value={fundingAmount}
              onChange={(e) => setFundingAmount(e.target.value)}
              style={{
                width: '100%',
                padding: theme.spacing.md,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.borderRadius.md,
                marginBottom: theme.spacing.md
              }}
            />
            <div style={{ display: 'flex', gap: theme.spacing.sm }}>
              <button
                onClick={handleFundChild}
                disabled={loading || !fundingAmount}
                style={{
                  flex: 1,
                  padding: theme.spacing.md,
                  backgroundColor: theme.colors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1
                }}
              >
                {loading ? 'Processing...' : 'Fund Account'}
              </button>
              <button
                onClick={() => setShowFundingModal(false)}
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

      {/* Purchase Package Modal */}
      {showPurchaseModal && (
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
            borderRadius: theme.borderRadius.md,
            maxWidth: 600,
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h3 style={{ color: theme.colors.primary, marginBottom: theme.spacing.md }}>
              Purchase Package for {selectedChild?.displayName}
            </h3>

            {/* Package Selection */}
            <div style={{ marginBottom: theme.spacing.lg }}>
              <h4 style={{ color: theme.colors.text.primary, marginBottom: theme.spacing.sm }}>
                Select Package
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: theme.spacing.md }}>
                {packages.map((pkg) => (
                  <div
                    key={pkg.id}
                    onClick={() => setSelectedPackage(pkg)}
                    style={{
                      padding: theme.spacing.md,
                      border: selectedPackage?.id === pkg.id ? `2px solid ${theme.colors.primary}` : `1px solid ${theme.colors.border}`,
                      borderRadius: theme.borderRadius.md,
                      cursor: 'pointer',
                      backgroundColor: selectedPackage?.id === pkg.id ? theme.colors.background.secondary : theme.colors.background.primary
                    }}
                  >
                    <h5 style={{ color: theme.colors.primary, marginBottom: theme.spacing.sm }}>
                      {pkg.title}
                    </h5>
                    <p style={{ color: theme.colors.text.secondary, fontSize: '0.9rem', marginBottom: theme.spacing.sm }}>
                      {pkg.description}
                    </p>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: theme.colors.primary }}>
                      ${pkg.price}/month
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add-ons Selection */}
            <div style={{ marginBottom: theme.spacing.lg }}>
              <h4 style={{ color: theme.colors.text.primary, marginBottom: theme.spacing.sm }}>
                Add-ons (Optional)
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: theme.spacing.md }}>
                {addOnPrograms.map((addOn) => (
                  <div
                    key={addOn.id}
                    onClick={() => handleAddOnSelection(addOn)}
                    style={{
                      padding: theme.spacing.md,
                      border: selectedAddOns.find(a => a.id === addOn.id) ? `2px solid ${theme.colors.primary}` : `1px solid ${theme.colors.border}`,
                      borderRadius: theme.borderRadius.md,
                      cursor: 'pointer',
                      backgroundColor: selectedAddOns.find(a => a.id === addOn.id) ? theme.colors.background.secondary : theme.colors.background.primary
                    }}
                  >
                    <h5 style={{ color: theme.colors.primary, marginBottom: theme.spacing.sm }}>
                      {addOn.title}
                    </h5>
                    <p style={{ color: theme.colors.text.secondary, fontSize: '0.9rem', marginBottom: theme.spacing.sm }}>
                      {addOn.description}
                    </p>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: theme.colors.primary }}>
                      ${addOn.standalonePrice}/month
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Total */}
            {selectedPackage && (
              <div style={{
                padding: theme.spacing.md,
                backgroundColor: theme.colors.background.secondary,
                borderRadius: theme.borderRadius.md,
                marginBottom: theme.spacing.md
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 'bold' }}>
                  <span>Total:</span>
                  <span>${calculateTotal()}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: theme.spacing.sm }}>
              <button
                onClick={handlePurchasePackage}
                disabled={loading || !selectedPackage}
                style={{
                  flex: 1,
                  padding: theme.spacing.md,
                  backgroundColor: theme.colors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1
                }}
              >
                {loading ? 'Processing...' : 'Purchase Package'}
              </button>
              <button
                onClick={() => setShowPurchaseModal(false)}
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
    </div>
  );
}

// Package data
const packages = [
  {
    id: 'youth-starter',
    title: 'Starter',
    price: 200,
    description: '4 group sessions + 2 tournaments per month'
  },
  {
    id: 'youth-developer',
    title: 'Developer',
    price: 380,
    description: '8 group sessions + 3 tournaments per month'
  },
  {
    id: 'youth-elite',
    title: 'Elite',
    price: 540,
    description: '12 group sessions + 4 tournaments per month'
  },
  {
    id: 'youth-champion',
    title: 'Champion',
    price: 680,
    description: '16 group sessions + 4 tournaments per month'
  }
];

// Add-on programs data
const addOnPrograms = [
  {
    id: 'ryp-academy-starter',
    title: 'RYP Academy Starter',
    description: '4 fitness sessions per month with Coach Phil',
    standalonePrice: 120
  },
  {
    id: 'mental-starter',
    title: 'Mental Performance Starter',
    description: '2 mental sessions per month with Coach Yannick',
    standalonePrice: 100
  },
  {
    id: 'tournament-prep',
    title: 'Tournament Prep',
    description: 'Personalized tournament strategy with Coach Yannick',
    standalonePrice: 400
  }
];

export default ParentDashboard;
