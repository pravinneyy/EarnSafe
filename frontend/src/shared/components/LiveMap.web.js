import React from 'react';

const LiveMap = ({ latitude = 13.0527, longitude = 80.2016 }) => {
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude-0.01}%2C${latitude-0.01}%2C${longitude+0.01}%2C${latitude+0.01}&layer=mapnik&marker=${latitude}%2C${longitude}`;

  return (
    <div style={{ width: '100%', height: '400px', overflow: 'hidden' }}>
      <iframe
        width="100%"
        height="100%"
        frameBorder="0"
        scrolling="no"
        marginHeight="0"
        marginWidth="0"
        src={mapUrl}
        style={{ border: 'none' }}
      ></iframe>
    </div>
  );
};

export default LiveMap;