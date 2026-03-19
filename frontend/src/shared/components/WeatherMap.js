import React from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for marker icon visibility
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow });
L.Marker.prototype.options.icon = DefaultIcon;

const WeatherMap = ({ lat, lon }) => {
  return (
    <div style={{ height: '250px', width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
      <MapContainer center={[lat, lon]} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[lat, lon]} />
      </MapContainer>
    </div>
  );
};

export default WeatherMap;