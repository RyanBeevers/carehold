/** The supplied final raster logo. Light/dark selection uses the early data-theme attribute. */
export function BrandLogo({stacked=false,className=''}:{stacked?:boolean,className?:string}) {
 const orientation=stacked?'stacked':'horizontal';
 const base=`/branding/carehold/logos/carehold-${orientation}-`;
 return <span className={`carehold-brand-logo${stacked?' is-stacked':''}${className?' '+className:''}`} role="img" aria-label="Carehold">
  <img className="carehold-logo-light" src={`${base}light-transparent.png`} alt="" decoding="async" />
  <img className="carehold-logo-dark" src={`${base}dark-transparent.png`} alt="" decoding="async" />
 </span>;
}
