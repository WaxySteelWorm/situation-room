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

          {/* World map SVG path */}
          <path
            d="M840,240 Q840,240 840,240 L840,240 L839,241 L837,242 L835,244 L833,245 L831,245 L829,245 L827,245 L825,245 L823,245 L821,245 L819,245 L817,245 L815,245 L813,245 L811,245 L809,245 L807,245 L805,245 L803,245 L801,245 L799,245 L797,245 L795,245 L793,245 L791,245 L789,245 L787,245 L785,245 L783,245 L781,245 L779,245 L777,245 L775,245 L773,245 L771,245 L769,245 L767,245 L765,245 L763,245 L761,245 L759,245 L757,245 L755,245 L753,245 L751,245 L749,245 L747,245 L745,245 L743,245 L741,245 L739,245 L737,245 L735,245 L733,245 L731,245 L729,245 L727,245 L725,245 L723,245 L721,245 L719,245 L717,245 L715,245 L713,245 L711,245 L709,245 L707,245 L705,245 L703,245 L701,245 L699,245 L697,245 L695,245 L693,245 L691,245 L689,245 L687,245 L685,245 L683,245 L681,245 L679,245 L677,245 L675,245 L673,245 L671,245 L669,245 L667,245 L665,245 L663,245 L661,245 L659,245 L657,245 L655,245 L653,245 L651,245 L649,245 L647,245 L645,245 L643,245 L641,245 L639,245 L637,245 L635,245 L633,245 L631,245 L629,245 L627,245 L625,245 L623,245 L621,245 L619,245 L617,245 L615,245 L613,245 L611,245 L609,245 L607,245 L605,245 L603,245 L601,245 L599,245 L597,245 L595,245 L593,245 L591,245 L589,245 L587,245 L585,245 L583,245 L581,245 L579,245 L577,245 L575,245 L573,245 L571,245 L569,245 L567,245 L565,245 L563,245 L561,245 L559,245 L557,245 L555,245 L553,245 L551,245 L549,245 L547,245 L545,245 L543,245 L541,245 L539,245 L537,245 L535,245 L533,245 L531,245 L529,245 L527,245 L525,245 L523,245 L521,245 L519,245 L517,245 L515,245 L513,245 L511,245 L509,245 L507,245 L505,245 L503,245 L501,245 L499,245 L497,245 L495,245 L493,245 L491,245 L489,245 L487,245 L485,245 L483,245 L481,245 L479,245 L477,245 L475,245 L473,245 L471,245 L469,245 L467,245 L465,245 L463,245 L461,245 L459,245 L457,245 L455,245 L453,245 L451,245 L449,245 L447,245 L445,245 L443,245 L441,245 L439,245 L437,245 L435,245 L433,245 L431,245 L429,245 L427,245 L425,245 L423,245 L421,245 L419,245 L417,245 L415,245 L413,245 L411,245 L409,245 L407,245 L405,245 L403,245 L401,245 L399,245 L397,245 L395,245 L393,245 L391,245 L389,245 L387,245 L385,245 L383,245 L381,245 L379,245 L377,245 L375,245 L373,245 L371,245 L369,245 L367,245 L365,245 L363,245 L361,245 L359,245 L357,245 L355,245 L353,245 L351,245 L349,245 L347,245 L345,245 L343,245 L341,245 L339,245 L337,245 L335,245 L333,245 L331,245 L329,245 L327,245 L325,245 L323,245 L321,245 L319,245 L317,245 L315,245 L313,245 L311,245 L309,245 L307,245 L305,245 L303,245 L301,245 L299,245 L297,245 L295,245 L293,245 L291,245 L289,245 L287,245 L285,245 L283,245 L281,245 L279,245 L277,245 L275,245 L273,245 L271,245 L269,245 L267,245 L265,245 L263,245 L261,245 L259,245 L257,245 L255,245 L253,245 L251,245 L249,245 L247,245 L245,245 L243,245 L241,245 L239,245 L237,245 L235,245 L233,245 L231,245 L229,245 L227,245 L225,245 L223,245 L221,245 L219,245 L217,245 L215,245 L213,245 L211,245 L209,245 L207,245 L205,245 L203,245 L201,245 L199,245 L197,245 L195,245 L193,245 L191,245 L189,245 L187,245 L185,245 L183,245 L181,245 L179,245 L177,245 L175,245 L173,245 L171,245 L169,245 L167,245 L165,245 L163,245 L161,245 L159,245 L157,245 L155,245 L153,245 L151,245 L149,245 L147,245 L145,245 L143,245 L141,245 L139,245 L137,245 L135,245 L133,245 L131,245 L129,245 L127,245 L125,245 L123,245 L121,245 L119,245 L117,245 L115,245 L113,245 L111,245 L109,245 L107,245 L105,245 L103,245 L101,245 L99,245 L97,245 L95,245 L93,245 L91,245 L89,245 L87,245 L85,245 L83,245 L81,245 L79,245 L77,245 L75,245 L73,245 L71,245 L69,245 L67,245 L65,245 L63,245 L61,245 L59,245 L57,245 L55,245 L53,245 L51,245 L49,245 L47,245 L45,245 L43,245 L41,245 L39,245 L37,245 L35,245 L33,245 L31,245 L29,245 L27,245 L25,245 L23,245 L21,245 L19,245 L17,245 L15,245 L13,245 L11,245 L9,245 L7,245 L5,245 L3,245 L1,245 L0,245 L0,0 L900,0 L900,245 Z" fill="#1a1a2e" opacity="0.5" />
          <path d="M150,100 Q200,50 250,100 T350,100 T450,100 T550,100 T650,100 T750,100" fill="none" stroke="#2a2a4a" strokeWidth="2" opacity="0.3" />

          {/* World Map Paths */}
          <g transform="scale(1.8) translate(0, 20)" style={{ transformOrigin: 'center' }}>
            {/* North America */}
            <path
              d="M 50 60 L 120 50 L 140 90 L 110 120 L 80 110 L 60 130 L 40 100 Z"
              fill="rgba(255, 255, 255, 0.05)"
              stroke="rgba(0, 243, 255, 0.2)"
              strokeWidth="0.5"
            />
            {/* South America */}
            <path
              d="M 120 130 L 150 140 L 140 200 L 110 190 L 100 150 Z"
              fill="rgba(255, 255, 255, 0.05)"
              stroke="rgba(0, 243, 255, 0.2)"
              strokeWidth="0.5"
            />
            {/* Europe */}
            <path
              d="M 220 50 L 260 45 L 270 70 L 240 80 L 210 70 Z"
              fill="rgba(255, 255, 255, 0.05)"
              stroke="rgba(0, 243, 255, 0.2)"
              strokeWidth="0.5"
            />
            {/* Africa */}
            <path
              d="M 210 90 L 260 90 L 270 140 L 240 180 L 200 140 L 190 100 Z"
              fill="rgba(255, 255, 255, 0.05)"
              stroke="rgba(0, 243, 255, 0.2)"
              strokeWidth="0.5"
            />
            {/* Asia */}
            <path
              d="M 280 50 L 380 50 L 420 80 L 400 130 L 350 140 L 320 100 L 290 90 Z"
              fill="rgba(255, 255, 255, 0.05)"
              stroke="rgba(0, 243, 255, 0.2)"
              strokeWidth="0.5"
            />
            {/* Australia */}
            <path
              d="M 380 160 L 430 160 L 420 190 L 370 180 Z"
              fill="rgba(255, 255, 255, 0.05)"
              stroke="rgba(0, 243, 255, 0.2)"
              strokeWidth="0.5"
            />
            {/* Greenland */}
            <path
              d="M 160 30 L 190 35 L 180 60 L 150 50 Z"
              fill="rgba(255, 255, 255, 0.05)"
              stroke="rgba(0, 243, 255, 0.2)"
              strokeWidth="0.5"
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

