import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSessionData } from '../services/dataService';

const SessionView = ({ user }) => {
  const { batchId } = useParams();
  const [sessionData, setSessionData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedClubs, setSelectedClubs] = useState({});

  useEffect(() => {
    if (!user || !batchId) return;
    
    setLoading(true);
    const unsubscribe = getSessionData(user, batchId, (data) => {
      if (data.length === 0) {
        setError('No data found for this session.');
        setSessionData([]);
      } else {
        setSessionData(data);
        // Initialize selected clubs
        const clubs = Array.from(new Set(data.map(shot => shot.club)));
        const initialSelected = {};
        clubs.forEach(club => (initialSelected[club] = true));
        setSelectedClubs(initialSelected);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, batchId]);

  // Calculate statistics for each club
  const clubStats = useMemo(() => {
    const stats = {};
    
    sessionData.forEach(shot => {
      const club = shot.club;
      if (!stats[club]) {
        stats[club] = {
          shots: [],
          carry: { values: [], avg: 0, min: 0, max: 0 },
          side: { values: [], avg: 0, min: 0, max: 0 },
          total: { values: [], avg: 0, min: 0, max: 0 },
          ballSpeed: { values: [], avg: 0, min: 0, max: 0 },
          spinRate: { values: [], avg: 0, min: 0, max: 0 }
        };
      }
      
      stats[club].shots.push(shot);
      if (shot.carry) stats[club].carry.values.push(shot.carry);
      if (shot.side) stats[club].side.values.push(shot.side);
      if (shot.total_distance) stats[club].total.values.push(shot.total_distance);
      if (shot.ball_speed) stats[club].ballSpeed.values.push(shot.ball_speed);
      if (shot.spin_rate) stats[club].spinRate.values.push(shot.spin_rate);
    });

    // Calculate averages, min, max for each club
    Object.keys(stats).forEach(club => {
      const clubStat = stats[club];
      ['carry', 'side', 'total', 'ballSpeed', 'spinRate'].forEach(metric => {
        const values = clubStat[metric].values;
        if (values.length > 0) {
          clubStat[metric].avg = values.reduce((a, b) => a + b, 0) / values.length;
          clubStat[metric].min = Math.min(...values);
          clubStat[metric].max = Math.max(...values);
        }
      });
    });

    return stats;
  }, [sessionData]);

  // Filter data based on selected clubs
  const filteredData = useMemo(() => {
    return sessionData.filter(shot => selectedClubs[shot.club]);
  }, [sessionData, selectedClubs]);

  const formatDistance = (value) => {
    return `${Math.round(value)} yds`;
  };

  const formatSpeed = (value) => {
    return `${Math.round(value)} mph`;
  };

  const formatSpin = (value) => {
    return `${Math.round(value)} rpm`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-600">Loading session data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 text-xl mb-4">{error}</div>
        <Link to="/sessions" className="text-blue-500 hover:underline">
          ← Back to Sessions
        </Link>
      </div>
    );
  }

  const sessionInfo = sessionData[0] || {};
  const clubs = Object.keys(clubStats);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            {sessionInfo.sessionName || 'Session Analysis'}
          </h2>
          <p className="text-gray-600">
            {sessionData.length} shots • {sessionInfo.vendor} • {sessionInfo.uploadedAt && new Date(sessionInfo.uploadedAt).toLocaleDateString()}
          </p>
          {sessionInfo.notes && (
            <p className="text-gray-600 mt-2 italic">"{sessionInfo.notes}"</p>
          )}
        </div>
        <Link 
          to="/sessions" 
          className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
        >
          ← Back to Sessions
        </Link>
      </div>

      {/* Club Selection */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Select Clubs to Analyze</h3>
        <div className="flex flex-wrap gap-3">
          {clubs.map(club => (
            <label key={club} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedClubs[club] || false}
                onChange={(e) => setSelectedClubs(prev => ({ ...prev, [club]: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-700">{club}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Club Statistics */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {clubs.map(club => {
          const stats = clubStats[club];
          const isSelected = selectedClubs[club];
          
          return (
            <div key={club} className={`bg-white rounded-lg shadow-md p-6 border-2 ${isSelected ? 'border-blue-500' : 'border-gray-200'}`}>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">{club}</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Shots:</span>
                  <span className="font-semibold">{stats.shots.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Avg Carry:</span>
                  <span className="font-semibold">{formatDistance(stats.carry.avg)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Carry Range:</span>
                  <span className="font-semibold">{formatDistance(stats.carry.min)} - {formatDistance(stats.carry.max)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Avg Side:</span>
                  <span className="font-semibold">{formatDistance(stats.side.avg)}</span>
                </div>
                {stats.ballSpeed.avg > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Ball Speed:</span>
                    <span className="font-semibold">{formatSpeed(stats.ballSpeed.avg)}</span>
                  </div>
                )}
                {stats.spinRate.avg > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Spin:</span>
                    <span className="font-semibold">{formatSpin(stats.spinRate.avg)}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Shot Details Table */}
      {filteredData.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Shot Details</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Club</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Carry</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Side</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ball Speed</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Spin Rate</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.map((shot, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{shot.club}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shot.carry ? formatDistance(shot.carry) : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shot.side ? formatDistance(shot.side) : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shot.total_distance ? formatDistance(shot.total_distance) : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shot.ball_speed ? formatSpeed(shot.ball_speed) : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shot.spin_rate ? formatSpin(shot.spin_rate) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionView; 