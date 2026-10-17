import type { KlopikSkin } from './skins';

const INK = '#192b35';
function Eyes({ variant, visor = false }: { variant: number; visor?: boolean }) {
  return <g className="office-eyes" fill={visor ? ['#91e2e0', '#b0d991', '#efbf79', '#c7b7ff'][variant] : INK}>
    <path d={variant === 1 ? 'M97 73h8v5h-8zM127 73h8v5h-8z' : variant === 2 ? 'M97 71h6v9h-6zM127 71h6v9h-6z' : 'M97 72h6v7h-6zM127 72h6v7h-6z'} />
  </g>;
}

export function SkinnedMascot({ skin, variant, raised, small }: { skin: Exclude<KlopikSkin, 'default'>; variant: number; raised: boolean; small: boolean }) {
  const v = ((variant % 4) + 4) % 4;
  const accent = ['#e9b65f', '#79c9c4', '#d8a0c2', '#a7bb78'][v];
  const sleeve = skin === 'robot' ? '#8ca7b5' : skin === 'astronaut' ? '#dbe6df' : skin === 'knight' ? '#9baab6' : skin === 'wizard' ? ['#6566a3', '#4d8c82', '#965c7c', '#677b51'][v] : ['#8a9c6b', '#a28b68', '#7e929b', '#9a7861'][v];
  return <g className={`office-mascot${small ? ' office-mascot-small' : ''}`} data-klopik-skin={skin} data-klopik-variant={v}>
    <g className="office-feet" fill={skin === 'astronaut' ? '#b3c7c9' : skin === 'robot' ? '#607d90' : '#38424a'}>
      <path d="M92 96h16v18H88v-7h4zM124 96h16v11h5v7h-21z" />
    </g>
    {skin === 'robot' && <>
      <path d="M84 52h64v48H84z" fill="#a9c0c8" /><path d="M88 56h56v36H88z" fill="#738e9e" />
      <path d="M91 61h50v25H91z" fill={INK} /><Eyes variant={v} visor />
      <path d="M93 94h46v11H93z" fill="var(--resident-color)" /><path d="M106 95h21v7h-21z" fill="#3c5766" />
      <path d="M85 62h-7v19h7M148 62h7v19h-7" fill="#637f92" />
      {v === 0 ? <><path d="M114 52V38h4v14" fill="#9db5be" /><rect x="110" y="33" width="12" height="8" fill={accent} /></>
        : v === 1 ? <path d="M93 52V37h6v15M133 52V37h6v15M89 35h14v6H89zM129 35h14v6h-14z" fill={accent} />
        : v === 2 ? <><path d="M105 52V42h22v10" fill="#617f90" /><path d="M111 34h10v13h-10z" fill={accent} /></>
        : <><path d="M119 52V41h17v5h-12v6" fill="#9db5be" /><path d="M134 34h9v16h-9z" fill={accent} /></>}
      <path d="M87 55h3v3h-3zM142 55h3v3h-3zM87 94h3v3h-3zM142 94h3v3h-3z" fill="#d9e5df" />
    </>}
    {skin === 'astronaut' && <>
      <path d="M77 65h13v33H77zM144 65h12v33h-12z" fill="#718a93" />
      <path d="M89 49h54v7h8v37h-8v12H88V93h-7V56h8z" fill="#dbe6df" />
      <path d="M91 55h48v6h6v23h-6v6H91v-6h-6V61h6z" fill="#344f61" />
      <path d="M96 59h24v4H94v12h-4V63h6z" fill="#89b7be" />
      <g className="office-eyes" fill="#b5e1db"><path d="M101 71h5v6h-5zM126 71h5v6h-5z" /></g>
      <path d="M89 91h54v5H89z" fill="var(--resident-color)" /><rect x="105" y="94" width="23" height="12" fill="#7d969a" />
      <path d="M109 97h5v4h-5zM119 97h5v4h-5z" fill={accent} />
      {v === 0 ? <path d="M109 45h14v5h-14z" fill={accent} /> : v === 1 ? <><path d="M83 59V44h4v15" fill="#a1b9bb" /><circle cx="85" cy="42" r="4" fill={accent} /></>
        : v === 2 ? <><rect x="127" y="45" width="17" height="8" fill="#597481" /><rect x="131" y="47" width="9" height="4" fill={accent} /></>
        : <><path d="M111 49h9v7h-9zM81 66h5v15h-5zM145 66h5v15h-5z" fill={accent} /><path d="M117 90v7h18v-6" fill="none" stroke="#739398" strokeWidth="3" /></>}
    </>}
    {skin === 'knight' && <>
      <path d="M90 50h52v7h7v36h-7v10H90V93h-7V57h7z" fill="#aab6bf" />
      <path d="M91 59h49v26H91z" fill="#4c6574" /><path d="M91 64h49v9H91z" fill={INK} />
      <Eyes variant={v} visor /><path d="M113 55h7v37h-7z" fill="#cdd2ce" />
      <path d="M89 90h54v15H89z" fill="var(--resident-color)" /><path d="M110 90h12v15h-12zM90 99h53v5H90z" fill={accent} />
      {v === 0 ? <path d="M114 50V34h8v5h8v6h-8v5z" fill="#d78172" /> : v === 1 ? <path d="M111 50V35h12v15M106 34h22v7h-22z" fill="#8ab5d3" />
        : v === 2 ? <path d="M88 60H78V47h7v8h9M144 60h11V47h-7v8h-9" fill="#dec89c" />
        : <><path d="M108 50V40h17v10" fill="#b5a0d0" /><path d="M116 40V32h5v8" fill={accent} /></>}
      <path d="M87 83h5v4h-5zM139 83h5v4h-5z" fill="#e1dcc8" />
    </>}
    {skin === 'wizard' && <>
      <path d="M87 63h57v29h-57z" fill="#d4b496" /><Eyes variant={v} />
      <path d="M89 86h54l6 26H83z" fill={sleeve} /><path d="M112 91h8v21h-8z" fill={accent} />
      <path d="M104 84h25v11h-5v7h-7v7h-7v-9h-6z" fill={v === 2 ? '#b2c9c3' : '#e2ded0'} />
      <path d={v === 0 ? 'M85 60l28-34 24 34z' : v === 1 ? 'M85 60l20-30 25 12-5 8 15 10z' : v === 2 ? 'M85 60l33-32 6 20 15 12z' : 'M85 60l20-32 18 9 14 23z'} fill={sleeve} />
      <path d="M79 58h73v8H79zM88 54h54v5H88z" fill={sleeve} />
      <path d="M91 54h47v5H91z" fill="var(--resident-color)" />
      {v === 0 ? <path d="m114 37 2 4 5 1-4 3 1 5-4-2-4 2 1-5-3-3 4-1z" fill={accent} />
        : v === 1 ? <path d="M113 39h5v6h-5zM106 45h4v4h-4z" fill={accent} /> : v === 2 ? <path d="M116 38h5v12h-8v-4h3z" fill={accent} />
        : <path d="m114 38 5 6-5 6-5-6z" fill={accent} />}
    </>}
    {skin === 'explorer' && <>
      <path d="M77 70h11v31H77z" fill="#5d6f52" /><path d="M86 58h60v34H86z" fill="#d9b68f" /><Eyes variant={v} />
      <path d="M86 87h60v18H86z" fill={sleeve} /><path d="M92 89h12v16H92zM129 89h11v16h-11z" fill="#c5b78e" />
      <path d="M90 87h52v5h-52zM118 91h10v14h-10z" fill={accent} /><path d="M87 99h58v5H87z" fill="#655746" />
      {v === 0 ? <><path d="M91 44h47v16H91zM78 59h76v7H78z" fill="#c4ae7f" /><path d="M91 54h47v6H91z" fill="#6a7855" /></>
        : v === 1 ? <><path d="M89 48h53v12H89zM84 58h62v7H84z" fill="#8d9b70" /><path d="M101 44h28v6h-28z" fill="#aab58b" /></>
        : v === 2 ? <><path d="M89 47h53v17H89z" fill="#71919c" /><path d="M89 57h54v8H89z" fill="#465965" /><path d="M94 58h15v8H94zM122 58h15v8h-15z" fill="#c0dbe0" /></>
        : <><path d="M93 45h44v15H93zM78 59h76v7H78z" fill="#947b61" /><path d="M91 54h48v6H91z" fill="var(--resident-color)" /><path d="M135 54V40h6v14" fill={accent} /></>}
    </>}
    <path d="M78 76h10v8H78zM144 76h10v8h-10z" fill={sleeve} />
    <g className="office-arm-left" fill={sleeve}><path d="M72 76h8v20h-8z" /><path d="M72 91h8v6h-8z" fill={accent} />
      {skin === 'knight' && <path d="M64 78h17v18l-8 8-9-8z" fill="var(--resident-color)" stroke="#d4c8a7" strokeWidth="2" />}</g>
    {raised ? <g transform="translate(152 79)"><g className="office-raised-arm" transform="rotate(-145)" fill={sleeve}><path d="M0 0h8v25H0z" /><path d="M0 19h8v6H0z" fill={accent} /></g></g>
      : <g className="office-arm-right" fill={sleeve}><path d="M152 76h8v20h-8z" /><path d="M152 91h8v6h-8z" fill={accent} /></g>}
  </g>;
}
