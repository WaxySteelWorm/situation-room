import { useState, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
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
function getPointSize(count: number, maxCount: number, zoom: number): number {
  const minSize = 4;
  const maxSize = 20;
  const normalized = Math.log(count + 1) / Math.log(maxCount + 1);
  // Scale point size inversely with zoom so they don't get huge when zoomed in
  return (minSize + normalized * (maxSize - minSize)) / Math.sqrt(zoom);
}

export default function ThreatMap({ points, isLoading, timeWindow, onTimeWindowChange }: ThreatMapProps) {
  const [hoveredPoint, setHoveredPoint] = useState<MapPoint | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  // Use 2:1 aspect ratio to match equirectangular projection
  const dimensions = { width: 1000, height: 500 };

  const maxCount = Math.max(...points.map(p => p.count), 1);
  const totalEvents = points.reduce((sum, p) => sum + p.count, 0);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(z * 1.5, 8));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(z / 1.5, 1));
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(1, Math.min(8, z * delta)));
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning && zoom > 1) {
      const newX = e.clientX - panStart.x;
      const newY = e.clientY - panStart.y;
      // Limit pan to keep map visible
      const maxPan = (zoom - 1) * 200;
      setPan({
        x: Math.max(-maxPan, Math.min(maxPan, newX)),
        y: Math.max(-maxPan, Math.min(maxPan, newY)),
      });
    }
  }, [isPanning, panStart, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
  }, []);

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
      <div
        ref={containerRef}
        className="relative overflow-hidden"
        style={{ height: '500px', cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {isLoading && (
          <div className="absolute inset-0 bg-cyber-black/80 backdrop-blur-sm flex items-center justify-center z-20">
            <div className="text-neon-blue animate-pulse flex items-center gap-2">
              <div className="w-2 h-2 bg-neon-blue rounded-full animate-bounce"></div>
              Loading threat data...
            </div>
          </div>
        )}

        {/* Zoom Controls */}
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-1">
          <button
            onClick={handleZoomIn}
            className="p-2 bg-cyber-black/80 hover:bg-cyber-black border border-white/10 rounded-lg transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={16} className="text-gray-400" />
          </button>
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 1}
            className="p-2 bg-cyber-black/80 hover:bg-cyber-black border border-white/10 rounded-lg transition-colors disabled:opacity-50"
            title="Zoom out"
          >
            <ZoomOut size={16} className="text-gray-400" />
          </button>
          <button
            onClick={handleReset}
            disabled={zoom <= 1}
            className="p-2 bg-cyber-black/80 hover:bg-cyber-black border border-white/10 rounded-lg transition-colors disabled:opacity-50"
            title="Reset view"
          >
            <Maximize2 size={16} className="text-gray-400" />
          </button>
          {zoom > 1 && (
            <div className="px-2 py-1 bg-cyber-black/80 border border-white/10 rounded-lg text-xs text-gray-400 text-center">
              {zoom.toFixed(1)}x
            </div>
          )}
        </div>

        {/* Zoomable/Pannable container */}
        <div
          className="absolute inset-0 transition-transform duration-100"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: 'center center',
          }}
        >
          {/* World Map Background Image - 2:1 equirectangular projection */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'url(/world-map.jpg)',
              backgroundSize: '100% 100%',
              backgroundPosition: 'center',
              filter: 'brightness(0.3) saturate(0.4)',
            }}
          />

          {/* Dark overlay with grid */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(rgba(5,5,5,0.7), rgba(5,5,5,0.7))',
              backgroundImage: `
                linear-gradient(rgba(0, 243, 255, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0, 243, 255, 0.03) 1px, transparent 1px)
              `,
              backgroundSize: '50px 50px',
            }}
          />

          <svg
            viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
            className="w-full h-full relative z-10"
            preserveAspectRatio="xMidYMid slice"
          >
          {/* Defs for effects */}
          <defs>
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

          {/* Threat points */}
          {points.map((point, idx) => {
            const { x, y } = latLngToXY(point.lat, point.lng, dimensions.width, dimensions.height);
            const size = getPointSize(point.count, maxCount, zoom);
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
        </div>{/* End zoomable container */}

        {/* Tooltip - outside zoom container so it doesn't scale */}
        {hoveredPoint && (
          <div
            className="absolute pointer-events-none bg-cyber-black/90 backdrop-blur-md border border-neon-red/30 rounded-lg px-3 py-2 text-sm shadow-[0_0_15px_rgba(255,0,0,0.2)] z-30"
            style={{
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
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
        <div className="absolute bottom-4 left-4 bg-cyber-black/80 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 z-20">
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
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-cyber-black/80 backdrop-blur-sm border border-neon-green/30 rounded-full px-3 py-1 shadow-[0_0_10px_rgba(0,255,157,0.2)] z-20">
          <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse shadow-[0_0_5px_rgba(0,255,157,0.8)]" />
          <span className="text-xs text-neon-green font-bold tracking-wider">LIVE</span>
        </div>
      </div>
    </div>
  );
}

