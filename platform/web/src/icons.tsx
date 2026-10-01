import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 18): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
});

export const Chip = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></svg>
);
export const Wifi = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19.5" r="1" fill="currentColor" /></svg>
);
export const Switch = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="2" y="8" width="20" height="8" rx="2" /><path d="M6 12h.01M10 12h.01M14 12h.01M18 12h.01" /></svg>
);
export const Shield = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const Server = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></svg>
);
export const Monitor = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4M7 12l3-3 2 2 4-4" /></svg>
);
export const Sliders = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
);
export const X = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const Check = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const Alert = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
);
export const Download = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
);
export const Flame = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 21c-3.9 0-7-2.8-7-6.6 0-3.3 2.3-5.4 3.6-7.4.5 1.6 1.4 2.7 2.4 3.3C11 7 12.4 4.6 14.6 3c.3 3 3 5.2 4 7.6.6 1.3.4 2.5.4 3.8 0 3.8-3.1 6.6-7 6.6Z" /></svg>
);
export const Person = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="5" r="2" /><path d="m9 21 2-6 2 2v4M7 12l3-4h4l3 3M14 8l-1 5" /></svg>
);
export const Play = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M7 5v14l11-7L7 5Z" /></svg>
);
export const Stop = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
);
export const Bulb = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3Z" /></svg>
);
export const Copy = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>
);
