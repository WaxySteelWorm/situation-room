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
    <div className="bg-cyber-gray/90 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden shadow-glass">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-cyber-black/20">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-neon-red animate-pulse shadow-[0_0_10px_rgba(255,0,0,0.5)]"></span>
            Global Threat Map
          </h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">Total blocked:</span>
            <span className="text-neon-pink font-mono font-bold drop-shadow-[0_0_5px_rgba(255,0,255,0.5)]">{totalEvents.toLocaleString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Time range:</span>
          <div className="flex bg-black/40 rounded-lg p-1 border border-white/5">
            {timeOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => onTimeWindowChange(opt.value)}
                className={`px-3 py-1 text-xs rounded-md transition-all duration-300 ${timeWindow === opt.value
                  ? 'bg-neon-red/20 text-neon-red shadow-[0_0_10px_rgba(255,0,0,0.2)]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
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
          <div className="absolute inset-0 bg-cyber-black/80 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="text-neon-blue animate-pulse flex items-center gap-2">
              <div className="w-2 h-2 bg-neon-blue rounded-full animate-bounce"></div>
              Loading threat data...
            </div>
          </div>
        )}

        <svg
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          className="w-full h-full"
          style={{ background: '#050505' }}
          preserveAspectRatio="xMidYMid slice"
        >
          {/* Grid Overlay */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0, 243, 255, 0.05)" strokeWidth="1" />
            </pattern>
            {/* Glow filter for points */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Pulse animation */}
            <radialGradient id="pulseGradient">
              <stop offset="0%" stopColor="#ff0000" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#ff0000" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Grid Background */}
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* World Map - Simplified but recognizable continents */}
          <g opacity="0.4">
            {/* North America */}
            <path
              d="M 100 50 L 180 40 L 220 60 L 240 100 L 230 140 L 200 160 L 160 150 L 120 130 L 90 100 L 80 70 Z"
              fill="rgba(26, 26, 46, 0.8)"
              stroke="rgba(0, 243, 255, 0.4)"
              strokeWidth="1.5"
            />
            {/* United States (more detailed) */}
            <path
              d="M 120 80 L 200 75 L 210 110 L 190 130 L 140 125 L 110 100 Z"
              fill="rgba(26, 26, 46, 0.9)"
              stroke="rgba(0, 243, 255, 0.5)"
              strokeWidth="1.5"
            />
            {/* South America */}
            <path
              d="M 160 150 L 200 155 L 210 200 L 200 250 L 170 260 L 150 240 L 140 200 L 145 170 Z"
              fill="rgba(26, 26, 46, 0.8)"
              stroke="rgba(0, 243, 255, 0.4)"
              strokeWidth="1.5"
            />
            {/* Europe */}
            <path
              d="M 400 50 L 460 45 L 480 70 L 470 100 L 440 110 L 410 95 L 390 70 Z"
              fill="rgba(26, 26, 46, 0.8)"
              stroke="rgba(0, 243, 255, 0.4)"
              strokeWidth="1.5"
            />
            {/* Africa */}
            <path
              d="M 420 100 L 480 95 L 500 140 L 490 200 L 460 220 L 430 200 L 410 150 L 405 120 Z"
              fill="rgba(26, 26, 46, 0.8)"
              stroke="rgba(0, 243, 255, 0.4)"
              strokeWidth="1.5"
            />
            {/* Asia */}
            <path
              d="M 500 40 L 700 35 L 750 60 L 780 100 L 760 150 L 720 170 L 680 160 L 640 140 L 600 120 L 560 100 L 530 70 L 510 50 Z"
              fill="rgba(26, 26, 46, 0.8)"
              stroke="rgba(0, 243, 255, 0.4)"
              strokeWidth="1.5"
            />
            {/* China/India region */}
            <path
              d="M 600 80 L 680 75 L 700 110 L 680 140 L 630 135 L 590 110 Z"
              fill="rgba(26, 26, 46, 0.9)"
              stroke="rgba(0, 243, 255, 0.5)"
              strokeWidth="1.5"
            />
            {/* Australia */}
            <path
              d="M 700 200 L 780 195 L 800 220 L 780 250 L 720 255 L 690 235 Z"
              fill="rgba(26, 26, 46, 0.8)"
              stroke="rgba(0, 243, 255, 0.4)"
              strokeWidth="1.5"
            />
            {/* Greenland */}
            <path
              d="M 280 20 L 340 25 L 330 60 L 300 65 L 270 50 Z"
              fill="rgba(26, 26, 46, 0.8)"
              stroke="rgba(0, 243, 255, 0.4)"
              strokeWidth="1.5"
            />
            {/* Equator line */}
            <line
              x1="0"
              y1="225"
              x2="900"
              y2="225"
              stroke="rgba(0, 243, 255, 0.15)"
              strokeWidth="1"
              strokeDasharray="5,5"
            />
          </g>

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
                  fill="#ff0000"
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
                  fill="#ffffff"
                  opacity={0.8}
                />
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoveredPoint && (
          <div
            className="absolute pointer-events-none bg-cyber-black/90 backdrop-blur-md border border-neon-red/30 rounded-lg px-3 py-2 text-sm shadow-[0_0_15px_rgba(255,0,0,0.2)] z-20"
            style={{
              left: latLngToXY(hoveredPoint.lat, hoveredPoint.lng, dimensions.width, dimensions.height).x + 20,
              top: latLngToXY(hoveredPoint.lat, hoveredPoint.lng, dimensions.width, dimensions.height).y - 10,
            }}
          >
            <div className="font-semibold text-white">
              {hoveredPoint.country_name || 'Unknown'}
            </div>
            <div className="text-neon-red font-mono drop-shadow-[0_0_5px_rgba(255,0,0,0.5)]">
              {hoveredPoint.count.toLocaleString()} blocked connections
            </div>
            <div className="text-gray-500 text-xs">
              {hoveredPoint.lat.toFixed(2)}, {hoveredPoint.lng.toFixed(2)}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-cyber-black/80 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2">
          <div className="text-xs text-gray-400 mb-2">Attack Intensity</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500 opacity-50" />
              <span className="text-xs text-gray-500">Low</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-xs text-gray-500">Medium</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded-full bg-red-600 shadow-[0_0_10px_rgba(255,0,0,0.5)]" />
              <span className="text-xs text-gray-500">High</span>
            </div>
          </div>
        </div>

        {/* Live indicator */}
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-cyber-black/80 backdrop-blur-sm border border-neon-green/30 rounded-full px-3 py-1 shadow-[0_0_10px_rgba(0,255,157,0.2)]">
          <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse shadow-[0_0_5px_rgba(0,255,157,0.8)]" />
          <span className="text-xs text-neon-green font-bold tracking-wider">LIVE</span>
        </div>
      </div>
    </div>
  );
}

