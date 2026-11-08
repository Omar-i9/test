import { useId } from 'react';
import type { TacticalPlanDocument, TacticalPlanDrawing } from '../../domain/tactics/tacticalPlanSchema';

const DRAWING_COLORS: Record<TacticalPlanDrawing['kind'], string> = {
  pass: '#F5F7FF',
  run: '#FFD166',
  press: '#FF5CAD',
  curve: '#C6A5FF',
  multiCurve: '#56E6FF',
  zone: '#FFB86B',
};

function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x * 100} ${points[0].y * 60}`;
  let path = `M ${points[0].x * 100} ${points[0].y * 60}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x * 100} ${c1y * 60}, ${c2x * 100} ${c2y * 60}, ${p2.x * 100} ${p2.y * 60}`;
  }
  return path;
}

function pathForDrawing(drawing: TacticalPlanDrawing): string {
  if (drawing.kind === 'curve' && drawing.points?.length === 3) {
    const [first, control, last] = drawing.points;
    return `M ${first.x * 100} ${first.y * 60} Q ${control.x * 100} ${control.y * 60} ${last.x * 100} ${last.y * 60}`;
  }
  if (drawing.kind === 'multiCurve' && drawing.points?.length) {
    return smoothPath(drawing.points);
  }
  return `M ${drawing.start.x * 100} ${drawing.start.y * 60} L ${drawing.end.x * 100} ${drawing.end.y * 60}`;
}

export function TacticalPlanMiniPreview({ plan, label }: { plan: TacticalPlanDocument; label: string }) {
  const markerPrefix = useId().replace(/:/g, '');
  return (
    <svg className="tactical-library-preview" viewBox="0 0 100 60" role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <defs>
        {(Object.keys(DRAWING_COLORS) as TacticalPlanDrawing['kind'][]).filter((kind) => kind !== 'zone').map((kind) => (
          <marker
            key={kind}
            id={`${markerPrefix}-arrow-${kind}`}
            markerWidth="3.8"
            markerHeight="3.8"
            refX="3.1"
            refY="1.9"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0 0 L3.4 1.9 L0 3.8 Z" fill={DRAWING_COLORS[kind]} />
          </marker>
        ))}
      </defs>
      <rect x="0" y="0" width="100" height="60" rx="4" fill="#164D3A" />
      <g fill="none" stroke="#E4F1E8" strokeWidth="0.55" opacity="0.76">
        <rect x="2.5" y="2.5" width="95" height="55" />
        <line x1="50" y1="2.5" x2="50" y2="57.5" />
        <circle cx="50" cy="30" r="7.5" />
        <rect x="2.5" y="19" width="14" height="22" />
        <rect x="83.5" y="19" width="14" height="22" />
      </g>
      <g className="tactical-library-preview-drawings">
        {plan.drawings.map((drawing) => {
          const color = DRAWING_COLORS[drawing.kind];
          if (drawing.kind === 'zone') {
            const x = Math.min(drawing.start.x, drawing.end.x) * 100;
            const y = Math.min(drawing.start.y, drawing.end.y) * 60;
            const width = Math.max(0.8, Math.abs(drawing.end.x - drawing.start.x) * 100);
            const height = Math.max(0.8, Math.abs(drawing.end.y - drawing.start.y) * 60);
            return <rect key={drawing.id} x={x} y={y} width={width} height={height} fill={color} fillOpacity=".16" stroke={color} strokeWidth=".65" />;
          }
          const dash = drawing.kind === 'run' ? '.45 .78 1.67 .78' : drawing.kind === 'press' ? '.17 .78' : drawing.kind === 'multiCurve' ? '.67 .56' : undefined;
          return (
            <path
              key={drawing.id}
              d={pathForDrawing(drawing)}
              fill="none"
              stroke={color}
              strokeWidth=".85"
              strokeDasharray={dash}
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd={`url(#${markerPrefix}-arrow-${drawing.kind})`}
            />
          );
        })}
      </g>
      <g className="tactical-library-preview-players">
        {plan.players.map((player) => (
          <g key={player.id}>
            <circle cx={player.position.x * 100} cy={player.position.y * 60} r="2.15" fill={player.team === 'home' ? '#E6F0E6' : '#193940'} stroke={player.team === 'home' ? '#9BF272' : '#BAC8D9'} strokeWidth=".8" />
            <text x={player.position.x * 100} y={player.position.y * 60 + .75} textAnchor="middle" fontSize="2.3" fontWeight="800" fill={player.team === 'home' ? '#193940' : '#F0F6F3'}>{player.number}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
