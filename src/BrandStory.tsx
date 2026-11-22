import type {MouseEvent} from 'react';
import approvedStory from '../docs/THE_STORY_BEHIND_OUR_ICON.md?raw';

/** Render only the two approved inline Markdown constructs, never raw/HTML injection. */
function emphasis(text:string) {
 return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean).map((part,index)=>{
  if(part.startsWith('**')&&part.endsWith('**'))return <strong key={index}>{part.slice(2,-2)}</strong>;
  if(part.startsWith('*')&&part.endsWith('*'))return <em key={index}>{part.slice(1,-1)}</em>;
  return part;
 });
}
const paragraphs=approvedStory.trim().split(/\r?\n\s*\r?\n/)
 .filter(part=>!part.trim().startsWith('# '))
 .map(part=>part.trim());

export function BrandStory({onNavigateBack}:{onNavigateBack:(event:MouseEvent<HTMLAnchorElement>)=>void}) {
 return <article className="brand-story" aria-labelledby="carehold-icon-story-title">
  <a className="brand-story-back" href="/settings" onClick={onNavigateBack}>← Back to settings</a>
  <div className="brand-story-hero">
   <img src="/branding/carehold/marks/carehold-symbol-transparent-1024.png"
    width="280" height="280" alt="Carehold symbol: a larger green figure and a smaller blue figure form a heart around a growing sprout" />
  </div>
  <p className="brand-story-eyebrow">ABOUT CAREHOLD</p>
  <h1 id="carehold-icon-story-title">The Story Behind Our Icon</h1>
  <div className="brand-story-copy">
   {paragraphs.map((paragraph,index)=><p key={index} className={index===0?'brand-story-premise':index===paragraphs.length-1?'brand-story-signoff':undefined}>{emphasis(paragraph)}</p>)}
  </div>
 </article>;
}
