import { useId } from 'react';
import type { Furniture, OfficeWorld } from './layout';

function Window({ x, width = 130 }: { x: number; width?: number }) {
  return <g transform={`translate(${x} 22)`}>
    <path d={`M0 0h${width}v58H0z`} fill="#142937" /><path d={`M6 6h${width - 12}v44H6z`} fill="#65828a" />
    <path d={`M8 42h15V26h18v16h12V17h20v25h18V30h${width - 99}v18H8z`} fill="#344f61" />
    <path className="office-window-lights" d="M29 31h3v3h-3zM60 24h3v3h-3zM67 32h3v3h-3zM96 35h3v3h-3z" fill="#e2ce9c" />
    <path d={`M${width / 2 - 3} 3h6v49h-6zM0 52h${width}v7H0z`} fill="#354f55" />
    <path d={`M-3 4h16v43H-3zM${width - 13} 4h16v43h-16z`} fill="#9aafa6" opacity=".65" />
  </g>;
}

function Monitor({ x = 25 }: { x?: number }) {
  return <g transform={`translate(${x} -27)`}>
    <path d="M-23-39h46v32h-46z" fill="#152733" /><path d="M-19-35h38v23h-38z" fill="#29414a" />
    <path className="office-screen-lines" d="M-15-30h20v2h-20zM-15-24h29v2h-29zM-15-18h12v2h-12z" fill="#a9cbb1" />
    <path className="office-cursor" d="M0-18h5v2H0z" fill="#e1c99a" />
    <path d="M-3-7h6v8h-6zM-12 1h24v3h-24z" fill="#192b34" />
  </g>;
}

function ObjectArt({ item }: { item: Furniture }) {
  const w = item.width;
  if (item.kind === 'desk' || item.kind === 'bench') return <>
    {w > 0 && <g transform={item.kind === 'bench' ? `translate(${w / 2} 0)` : undefined}>
      <ellipse cy="14" rx={w / 2 + 5} ry="9" fill="#142724" opacity=".4" />
      <path d={`M${-w / 2 + 8}-8h6v27h-6zM${w / 2 - 14}-8h6v27h-6z`} fill="#5e6d62" />
      <rect x={-w / 2} y="-28" width={w} height="24" rx="2" fill="#b8a17d" />
      <rect x={-w / 2} y="-4" width={w} height="6" fill="#86765b" />
      <path d={`M${-w / 2 + 5}-26h${w - 10}`} stroke="#d3bc93" strokeWidth="2" />
    </g>}
    {item.kind === 'desk' && <><Monitor /><path d="M-24-18H5v6h-29z" fill="#73867e" /><path d="M-20-17H1v2h-21z" fill="#c0ceb8" />
      <path d="M-44-23h10v11h-10zM-34-21h4v6h-4z" fill="#e2d2aa" />
      <path className="office-steam" d="M-41-36v8m5-12v10" stroke="#d3dcc6" strokeWidth="2" /></>}
  </>;
  if (item.kind === 'sofa') return <>
    <ellipse cy="14" rx={w / 2} ry="9" fill="#142724" opacity=".4" />
    <rect x={-w / 2} y="-45" width={w} height="42" rx="4" fill="#486e65" />
    <rect x={-w / 2 + 7} y="-40" width={w - 14} height="26" rx="3" fill="#789a89" />
    <rect x={-w / 2} y="-16" width={w} height="24" rx="3" fill="#658774" />
    <rect x={-w / 2 + 8} y="-14" width={w - 16} height="9" fill="#9bb19a" />
    <path d={`M${-w / 2 - 4}-25h12v36h-12zM${w / 2 - 8}-25h12v36h-12z`} fill="#a0b9a0" />
  </>;
  if (item.kind === 'board') return <>
    <path d={`M${-w / 2 + 10}-6h5v25h-5zM${w / 2 - 15}-6h5v25h-5z`} fill="#6a7c7a" />
    <rect x={-w / 2} y="-47" width={w} height="45" rx="2" fill="#557076" />
    <rect x={-w / 2 + 5} y="-42" width={w - 10} height="35" fill="#bbcfbd" />
    <path d={`M${-w / 2 + 14}-32h${w * .4}m${-w * .4} 9h${w * .52}m${-w * .52} 8h${w * .25}`} stroke="#62867f" strokeWidth="2.5" />
    <rect x={w / 2 - 26} y="-36" width="13" height="13" fill="#d7bd7c" />
  </>;
  if (item.kind === 'plant') return <>
    <ellipse cy="5" rx="22" ry="7" fill="#122523" opacity=".4" />
    <path d="M-13-18h26l-3 23h-20z" fill="#b38c73" /><path d="M-13-18h26v5h-26z" fill="#c6a586" />
    <g className="office-leaves"><path d="M0-17v-40" stroke="#91b18b" strokeWidth="4" />
      <path d="M0-39Q-29-62-25-34Q-14-23 0-28M0-37Q29-62 24-34Q14-23 0-28M0-47Q-12-73-1-69Q12-60 0-47" fill="#83aa8d" />
      <path d="M0-30Q-23-39-18-19Q-9-16 0-22M0-30Q23-38 19-19Q9-16 0-22" fill="#b0c99e" /></g>
  </>;
  if (item.kind === 'coffee') return <>
    <path d="M-28-6h56v14h-56z" fill="#9b8065" /><rect x="-22" y="-60" width="44" height="54" rx="2" fill="#657f78" />
    <path d="M-16-54h32v20h-32zM-13-29h26v17h-26z" fill="#263e40" /><path d="M-11-49h15v3h-15z" fill="#abc6a7" />
    <circle cx="12" cy="-47" r="2" fill="#d9cb8f" className="office-cursor" /><path d="M-5-24h10v11H-5zM5-22h4v6H5z" fill="#e1cfaa" />
    <path className="office-steam" d="M-2-38v9m6-12v9" stroke="#d1d9bf" strokeWidth="2" />
  </>;
  return null;
}

export function Scenery({ world, waiting }: { world: OfficeWorld; waiting: number }) {
  const id = useId().replace(/:/g, '');
  return <g aria-hidden="true">
    <defs>
      <pattern id={`${id}wood`} width="120" height="60" patternUnits="userSpaceOnUse"><rect width="120" height="60" fill="#344843" />
        <path d="M0 0H120M0 30H120M0 60H120M60 0v30M25 30v30" stroke="#233b37" strokeWidth="1" />
        <path d="M7 9h30m40 12h25M38 42h31m15 8h24" stroke="#7c9281" strokeOpacity=".15" /></pattern>
      <pattern id={`${id}rug`} width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 4h8M4 0v8" stroke="#c1dfbd" strokeOpacity=".06" /></pattern>
    </defs>
    <rect width={world.width} height={world.height} fill="#1a2c36" />
    <rect x="18" y="18" width={world.width - 36} height={world.height - 36} rx="5" fill={`url(#${id}wood)`} />
    <rect x="18" y="18" width={world.width - 36} height="63" fill="#354e5a" />
    <path d={`M18 82H${world.width - 18}`} stroke="#1b3440" strokeWidth="11" />
    <path d={`M18 79H${world.width - 18}`} stroke="#77918b" strokeWidth="3" />
    {[.16, .47, .78].map(x => <Window key={x} x={world.width * x - 60} />)}
    <g transform={`translate(${world.width - 57} 48)`}><circle r="19" fill="#19313a" /><circle r="14" fill="#bbc9b2" />
      <path d="M0-9V0h7" fill="none" stroke="#466057" strokeWidth="2.5" /></g>
    {world.rooms.map(room => <g key={room.id} data-zone={room.kind === 'waiting' ? 'meeting' : room.kind}>
      <rect x={room.x + 4} y={room.y + 6} width={room.width} height={room.height} rx="5" fill="#16292388" />
      <rect x={room.x} y={room.y} width={room.width} height={room.height} rx="5" fill={room.kind === 'waiting' ? '#47495d' : room.kind === 'lounge' ? '#38574e' : '#3b574d'} />
      <rect x={room.x} y={room.y} width={room.width} height={room.height} rx="5" fill={`url(#${id}rug)`} />
      <rect x={room.x + 7} y={room.y + 7} width={room.width - 14} height={room.height - 14} rx="3" fill="none" stroke="#abc4ac" strokeOpacity=".16" />
      <text x={room.x + 15} y={room.y + 24} className="office-room-title">{room.label.length > 26 ? `${room.label.slice(0, 25)}…` : room.label}<title>{room.label}</title></text>
      {room.kind === 'waiting' && <circle cx={room.x + room.width - 18} cy={room.y + 19} r="4" fill={waiting ? '#efd081' : '#7c9290'} />}
    </g>)}
    <g data-zone="superwork"><title>Superwork — continuous work over one hour</title></g>
    <path d={`M35 ${world.height - 64}v42h75v-42`} fill="#28474a" stroke="#739580" strokeWidth="2" />
    <path d={`M40 ${world.height - 30}h65`} stroke="#c4d3a5" strokeWidth="3" />
    <text x="124" y={world.height - 33} className="office-floor-note">ENTRANCE →</text>
    {[...world.furniture].sort((a, b) => a.y - b.y).map(item => <g key={item.id} transform={`translate(${item.x} ${item.y})`}><ObjectArt item={item} /></g>)}
  </g>;
}
