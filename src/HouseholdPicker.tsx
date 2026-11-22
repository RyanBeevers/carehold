import {useEffect,useId,useRef,useState,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {Check,ChevronDown} from 'lucide-react';
import type {Household} from './lib/api';

/**
 * Consistent care-circle picker for the main toolbar. One available circle
 * is display-only; multiple circles use an accessible, keyboard-operated
 * application listbox rather than an OS-native dropdown with odd styling.
 */
export function HouseholdPicker({households,value,onChange}:{
 households:Household[],value:string,onChange:(id:string)=>void
}){
 const [open,setOpen]=useState(false);
 const root=useRef<HTMLDivElement>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 const options=useRef<Array<HTMLButtonElement|null>>([]);
 const id=useId();
 const current=households.find(h=>h.id===value)??households[0];
 const activeIndex=Math.max(0,households.findIndex(h=>h.id===current?.id));
 useEffect(()=>{
  if(!open)return;
  options.current[activeIndex]?.focus();
  const closeOnOutside=(e:PointerEvent)=>{if(e.target instanceof Node&&!root.current?.contains(e.target))setOpen(false);};
  const closeOnEscape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};
  document.addEventListener('pointerdown',closeOnOutside);
  document.addEventListener('keydown',closeOnEscape);
  return()=>{document.removeEventListener('pointerdown',closeOnOutside);document.removeEventListener('keydown',closeOnEscape);};
 },[open,activeIndex]);
 useEffect(()=>{setOpen(false);},[value,households.length]);
 if(!current)return <span className="household-picker-name">No care circle</span>;
 if(households.length===1)return <div className="household-picker-single" aria-label={'Current care circle: '+current.name}>{current.name}</div>;
 const choose=(id:string)=>{onChange(id);setOpen(false);trigger.current?.focus();};
 const move=(e:ReactKeyboardEvent<HTMLButtonElement>,index:number)=>{
  let next=index;
  if(e.key==='ArrowDown')next=(index+1)%households.length;
  else if(e.key==='ArrowUp')next=(index-1+households.length)%households.length;
  else if(e.key==='Home')next=0;
  else if(e.key==='End')next=households.length-1;
  else if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(households[index].id);return;}
  else if(e.key==='Tab'){setOpen(false);return;}
  else return;
  e.preventDefault();options.current[next]?.focus();
 };
 return <div className="household-picker" ref={root}>
  <button ref={trigger} type="button" className="household-picker-trigger"
   aria-label={'Choose care circle. Current: '+current.name} aria-expanded={open}
   aria-haspopup="listbox" aria-controls={open?id:undefined} onClick={()=>setOpen(v=>!v)}
   onKeyDown={e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
     e.preventDefault();setOpen(true);
    }
   }}>
   <span>{current.name}</span><ChevronDown size={17} aria-hidden="true"/>
  </button>
  {open&&<div id={id} role="listbox" aria-label="Care circles" className="household-picker-options">
   {households.map((h,index)=><button ref={node=>{options.current[index]=node;}} key={h.id}
    type="button" role="option" className="household-picker-option"
    aria-selected={h.id===current.id} onKeyDown={e=>move(e,index)}
    onClick={()=>choose(h.id)}>
    <span>{h.name}</span>{h.id===current.id&&<Check size={17} aria-hidden="true"/>}
   </button>)}
  </div>}
 </div>;
}
