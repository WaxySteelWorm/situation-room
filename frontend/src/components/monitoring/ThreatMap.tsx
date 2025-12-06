import { useState } from 'react';
import type { MapPoint } from '../../types';

interface ThreatMapProps {
  points: MapPoint[];
  isLoading?: boolean;
  timeWindow: number;
  onTimeWindowChange: (minutes: number) => void;
}

// Convert lat/lng to SVG coordinates (Mercator-ish projection)
function latLngToXY(lat: number, lng: number, width: number, height: number): { x: number; y: number } {
  // Simple equirectangular projection
  const x = ((lng + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return { x, y };
}

// Calculate point size based on count
function getPointSize(count: number, maxCount: number): number {
  const minSize = 4;
  const maxSize = 20;
  const normalized = Math.log(count + 1) / Math.log(maxCount + 1);
  return minSize + normalized * (maxSize - minSize);
}

export default function ThreatMap({ points, isLoading, timeWindow, onTimeWindowChange }: ThreatMapProps) {
  const [hoveredPoint, setHoveredPoint] = useState<MapPoint | null>(null);
  const dimensions = { width: 900, height: 450 };

  const maxCount = Math.max(...points.map(p => p.count), 1);
  const totalEvents = points.reduce((sum, p) => sum + p.count, 0);

  const timeOptions = [
    { value: 5, label: '5 min' },
    { value: 15, label: '15 min' },
    { value: 60, label: '1 hour' },
    { value: 360, label: '6 hours' },
    { value: 1440, label: '24 hours' },
  ];

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-white">Global Threat Map</h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Total blocked:</span>
            <span className="text-red-400 font-mono font-bold">{totalEvents.toLocaleString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Time range:</span>
          <div className="flex bg-gray-800 rounded-lg p-1">
            {timeOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => onTimeWindowChange(opt.value)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  timeWindow === opt.value
                    ? 'bg-red-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="relative" style={{ height: '500px' }}>
        {isLoading && (
          <div className="absolute inset-0 bg-gray-900/80 flex items-center justify-center z-10">
            <div className="text-gray-400">Loading threat data...</div>
          </div>
        )}

        <svg
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          className="w-full h-full"
          style={{ background: '#0f172a' }}
          preserveAspectRatio="xMidYMid slice"
        >
          {/* Glow filter for points */}
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Pulse animation */}
            <radialGradient id="pulseGradient">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* World map image */}
          <image
            href="https://upload.wikimedia.org/wikipedia/commons/e/e8/Flat_earth_night.png"
            x="0"
            y="0"
            width={dimensions.width}
            height={dimensions.height}
            preserveAspectRatio="xMidYMid slice"
            opacity="0.6"
          />

          {/* Threat points */}
          {points.map((point, idx) => {
            const { x, y } = latLngToXY(point.lat, point.lng, dimensions.width, dimensions.height);
            const size = getPointSize(point.count, maxCount);
            const isHovered = hoveredPoint === point;

            return (
              <g key={`${point.lat}-${point.lng}-${idx}`}>
                {/* Pulse ring animation */}
                <circle
                  cx={x}
                  cy={y}
                  r={size * 2}
                  fill="url(#pulseGradient)"
                  opacity={0.3}
                  className="animate-pulse"
                />
                {/* Main point */}
                <circle
                  cx={x}
                  cy={y}
                  r={size}
                  fill="#ef4444"
                  filter="url(#glow)"
                  opacity={0.9}
                  className="cursor-pointer transition-all duration-200"
                  style={{
                    transform: isHovered ? `scale(1.5)` : 'scale(1)',
                    transformOrigin: `${x}px ${y}px`
                  }}
                  onMouseEnter={() => setHoveredPoint(point)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
                {/* Inner bright core */}
                <circle
                  cx={x}
                  cy={y}
                  r={size * 0.4}
                  fill="#fca5a5"
                  opacity={0.8}
                />
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoveredPoint && (
          <div
            className="absolute pointer-events-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl z-20"
            style={{
              left: latLngToXY(hoveredPoint.lat, hoveredPoint.lng, dimensions.width, dimensions.height).x + 20,
              top: latLngToXY(hoveredPoint.lat, hoveredPoint.lng, dimensions.width, dimensions.height).y - 10,
            }}
          >
            <div className="font-semibold text-white">
              {hoveredPoint.country_name || 'Unknown'}
            </div>
            <div className="text-red-400 font-mono">
              {hoveredPoint.count.toLocaleString()} blocked connections
            </div>
            <div className="text-gray-500 text-xs">
              {hoveredPoint.lat.toFixed(2)}, {hoveredPoint.lng.toFixed(2)}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-gray-800/90 border border-gray-700 rounded-lg px-3 py-2">
          <div className="text-xs text-gray-400 mb-2">Attack Intensity</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-400 opacity-50" />
              <span className="text-xs text-gray-500">Low</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-xs text-gray-500">Medium</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded-full bg-red-600 shadow-lg shadow-red-500/50" />
              <span className="text-xs text-gray-500">High</span>
            </div>
          </div>
        </div>

        {/* Live indicator */}
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-gray-800/90 border border-gray-700 rounded-full px-3 py-1">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-gray-400">Live</span>
        </div>
      </div>
    </div>
  );
}

