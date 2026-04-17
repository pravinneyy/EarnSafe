import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { getLeafletTileConfig } from '../utils/mapTiles';

const LiveMap = ({ location, isDark }) => {
  // Use current location or default to Mumbai
  const lat = location?.latitude || 19.076;
  const lon = location?.longitude || 72.8777;
  const { tileUrl, attribution, errorMessage, maxZoom, subdomains } = getLeafletTileConfig({ isDark });

  const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <style>
        #map { height: 100vh; width: 100vw; margin: 0; padding: 0; }
        body { margin: 0; background-color: ${isDark ? '#080E1A' : '#f5f5f5'}; }
        .leaflet-top.leaflet-right {
          top: 104px;
          right: 10px;
        }
        .leaflet-control-attribution {
          background: ${isDark ? 'rgba(8,14,26,0.92)' : 'rgba(255,255,255,0.94)'} !important;
          color: ${isDark ? 'rgba(255,255,255,0.72)' : 'rgba(15,23,42,0.58)'} !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 9px !important;
          line-height: 1.3;
          padding: 4px 8px !important;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.14);
          max-width: 180px;
        }
        .leaflet-control-attribution a {
          color: ${isDark ? 'rgba(255,255,255,0.84)' : 'rgba(15,23,42,0.72)'} !important;
          text-decoration: none;
        }
        .leaflet-control-attribution a:focus,
        .leaflet-control-attribution a:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        ${tileUrl
          ? `
        var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${lat}, ${lon}], 15);
        L.tileLayer(${JSON.stringify(tileUrl)}, {
          maxZoom: ${maxZoom},
          subdomains: ${JSON.stringify(subdomains)}
        }).addTo(map);
        L.control.attribution({
          position: 'topright',
          prefix: false
        }).addTo(map).addAttribution(${JSON.stringify(attribution)});
        L.marker([${lat}, ${lon}]).addTo(map);
        `
          : `
        document.getElementById('map').innerHTML =
          '<div style="display:flex;height:100%;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:sans-serif;color:${isDark ? '#FFFFFF' : '#0F172A'};background:${isDark ? '#080E1A' : '#F5F5F5'};">${errorMessage}</div>';
        `}
      </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView 
        originWhitelist={['*']} 
        source={{ html: mapHtml }} 
        scrollEnabled={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' }
});

export default LiveMap;
