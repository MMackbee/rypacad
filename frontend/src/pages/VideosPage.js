import React, { useState } from 'react';
import { theme } from '../styles/theme';

function VideosPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const videoData = {
    'speed-training': {
      title: 'Speed Training',
      videos: [
        {
          id: 'speed-1',
          title: 'Rypstick Speed Protocol',
          description: 'Learn the complete Rypstick training protocol used by Tour professionals.',
          duration: '12:34',
          instructor: 'Mike Rypien',
          thumbnail: 'speed-training-1.jpg',
          views: 15420,
          rating: 4.9,
          featured: true
        },
        {
          id: 'speed-2',
          title: 'Biomechanics of Speed',
          description: 'Understanding the biomechanics behind generating maximum clubhead speed.',
          duration: '18:22',
          instructor: 'Dr. Sarah Johnson',
          thumbnail: 'speed-training-2.jpg',
          views: 8920,
          rating: 4.8,
          featured: false
        },
        {
          id: 'speed-3',
          title: 'Speed Drills for Distance',
          description: 'Essential drills to increase your driving distance through proper sequencing.',
          duration: '15:45',
          instructor: 'Mike Rypien',
          thumbnail: 'speed-training-3.jpg',
          views: 12340,
          rating: 4.7,
          featured: false
        }
      ]
    },
    'swing-mechanics': {
      title: 'Swing Mechanics',
      videos: [
        {
          id: 'mechanics-1',
          title: 'Perfect Your Backswing',
          description: 'Master the fundamentals of a proper backswing for consistent ball striking.',
          duration: '14:18',
          instructor: 'Coach Mark Davis',
          thumbnail: 'mechanics-1.jpg',
          views: 9870,
          rating: 4.8,
          featured: true
        },
        {
          id: 'mechanics-2',
          title: 'Downswing Sequence',
          description: 'Learn the proper downswing sequence for maximum power and accuracy.',
          duration: '16:32',
          instructor: 'Coach Mark Davis',
          thumbnail: 'mechanics-2.jpg',
          views: 7650,
          rating: 4.7,
          featured: false
        },
        {
          id: 'mechanics-3',
          title: 'Impact Position',
          description: 'Achieving the perfect impact position for consistent ball flight.',
          duration: '13:45',
          instructor: 'Dr. Sarah Johnson',
          thumbnail: 'mechanics-3.jpg',
          views: 6540,
          rating: 4.6,
          featured: false
        }
      ]
    },
    'mental-game': {
      title: 'Mental Game',
      videos: [
        {
          id: 'mental-1',
          title: 'Pre-Shot Routine',
          description: 'Develop a consistent pre-shot routine for tournament success.',
          duration: '11:28',
          instructor: 'Dr. Lisa Chen',
          thumbnail: 'mental-1.jpg',
          views: 5430,
          rating: 4.9,
          featured: true
        },
        {
          id: 'mental-2',
          title: 'Pressure Performance',
          description: 'Techniques for performing under pressure in competitive situations.',
          duration: '19:15',
          instructor: 'Dr. Lisa Chen',
          thumbnail: 'mental-2.jpg',
          views: 4320,
          rating: 4.8,
          featured: false
        }
      ]
    },
    'putting': {
      title: 'Putting',
      videos: [
        {
          id: 'putting-1',
          title: 'ButterBlade Putting System',
          description: 'Master the ButterBlade putting system for improved accuracy and consistency.',
          duration: '22:14',
          instructor: 'Mike Rypien',
          thumbnail: 'putting-1.jpg',
          views: 8760,
          rating: 4.9,
          featured: true
        },
        {
          id: 'putting-2',
          title: 'Distance Control',
          description: 'Perfect your distance control for consistent putting performance.',
          duration: '17:33',
          instructor: 'Coach Mark Davis',
          thumbnail: 'putting-2.jpg',
          views: 6540,
          rating: 4.7,
          featured: false
        }
      ]
    }
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

  const searchContainerStyle = {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: theme.spacing.xl
  };

  const searchInputStyle = {
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    backgroundColor: theme.colors.background.secondary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSizes.base,
    fontFamily: theme.typography.fontFamily.body,
    width: '400px',
    maxWidth: '100%',
    transition: 'border-color 0.2s ease'
  };

  const categoryTabsStyle = {
    display: 'flex',
    justifyContent: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
    flexWrap: 'wrap'
  };

  const tabStyle = {
    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
    backgroundColor: 'transparent',
    color: theme.colors.text.secondary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.base,
    fontFamily: theme.typography.fontFamily.body,
    transition: 'all 0.2s ease'
  };

  const activeTabStyle = {
    ...tabStyle,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    borderColor: theme.colors.primary
  };

  const videosGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
    gap: theme.spacing.xl
  };

  const videoCardStyle = {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    overflow: 'hidden',
    transition: 'all 0.3s ease',
    cursor: 'pointer'
  };

  const videoThumbnailStyle = {
    width: '100%',
    height: '200px',
    backgroundColor: theme.colors.background.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSizes.lg,
    fontFamily: theme.typography.fontFamily.body,
    position: 'relative'
  };

  const durationStyle = {
    position: 'absolute',
    bottom: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    color: theme.colors.text.primary,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    fontSize: theme.typography.fontSizes.sm,
    fontFamily: theme.typography.fontFamily.body
  };

  const featuredBadgeStyle = {
    position: 'absolute',
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body
  };

  const videoContentStyle = {
    padding: theme.spacing.lg
  };

  const videoTitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const videoDescriptionStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.lineHeights.normal,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.body
  };

  const videoMetaStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm
  };

  const instructorStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body
  };

  const viewsStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const ratingStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs
  };

  const starStyle = {
    color: theme.colors.secondary,
    fontSize: theme.typography.fontSizes.sm
  };

  const ratingTextStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const playButtonStyle = {
    width: '100%',
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  };

  const categories = [
    { id: 'all', name: 'All Videos' },
    { id: 'speed-training', name: 'Speed Training' },
    { id: 'swing-mechanics', name: 'Swing Mechanics' },
    { id: 'mental-game', name: 'Mental Game' },
    { id: 'putting', name: 'Putting' }
  ];

  const getAllVideos = () => {
    const allVideos = [];
    Object.values(videoData).forEach(category => {
      category.videos.forEach(video => {
        allVideos.push({ ...video, category: category.title });
      });
    });
    return allVideos;
  };

  const getFilteredVideos = () => {
    let videos = [];
    if (selectedCategory === 'all') {
      videos = getAllVideos();
    } else {
      videos = videoData[selectedCategory]?.videos || [];
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      videos = videos.filter(video => 
        video.title.toLowerCase().includes(query) ||
        video.description.toLowerCase().includes(query) ||
        video.instructor.toLowerCase().includes(query)
      );
    }

    return videos;
  };

  const renderStars = (rating) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <span key={i} style={starStyle}>
          {i <= rating ? '★' : '☆'}
        </span>
      );
    }
    return stars;
  };

  const formatViews = (views) => {
    if (views >= 1000000) {
      return `${(views / 1000000).toFixed(1)}M`;
    } else if (views >= 1000) {
      return `${(views / 1000).toFixed(1)}K`;
    }
    return views.toString();
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Training Videos</h1>
        <p style={subtitleStyle}>
          Access our comprehensive library of training videos from Tour professionals and expert instructors
        </p>
      </div>

      <div style={searchContainerStyle}>
        <input
          type="text"
          placeholder="Search videos..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={searchInputStyle}
        />
      </div>

      <div style={categoryTabsStyle}>
        {categories.map((category) => (
          <button
            key={category.id}
            style={selectedCategory === category.id ? activeTabStyle : tabStyle}
            onClick={() => setSelectedCategory(category.id)}
            onMouseEnter={(e) => {
              if (selectedCategory !== category.id) {
                e.target.style.backgroundColor = theme.colors.background.secondary;
                e.target.style.color = theme.colors.primary;
                e.target.style.borderColor = theme.colors.primary;
              }
            }}
            onMouseLeave={(e) => {
              if (selectedCategory !== category.id) {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = theme.colors.text.secondary;
                e.target.style.borderColor = theme.colors.border;
              }
            }}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div style={videosGridStyle}>
        {getFilteredVideos().map((video) => (
          <div 
            key={video.id} 
            style={videoCardStyle}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-4px)';
              e.target.style.boxShadow = theme.shadows.lg;
              e.target.style.borderColor = theme.colors.primary;
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = 'none';
              e.target.style.borderColor = theme.colors.border;
            }}
          >
            <div style={videoThumbnailStyle}>
              {video.title} - Video Thumbnail
              <div style={durationStyle}>{video.duration}</div>
              {video.featured && (
                <div style={featuredBadgeStyle}>FEATURED</div>
              )}
            </div>
            <div style={videoContentStyle}>
              <h3 style={videoTitleStyle}>{video.title}</h3>
              <p style={videoDescriptionStyle}>{video.description}</p>
              
              <div style={videoMetaStyle}>
                <div style={instructorStyle}>{video.instructor}</div>
                <div style={viewsStyle}>{formatViews(video.views)} views</div>
              </div>

              <div style={ratingStyle}>
                {renderStars(video.rating)}
                <span style={ratingTextStyle}>{video.rating}</span>
              </div>

              <button 
                style={playButtonStyle}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#009a47';
                  e.target.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = theme.colors.primary;
                  e.target.style.transform = 'translateY(0)';
                }}
              >
                ▶ Watch Video
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default VideosPage; 