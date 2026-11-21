import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import {Check,Search,RefreshCcw,X} from 'lucide-react';
import {api,StaleSessionRequest} from './lib/api';
import type {CatalogOption,CatalogResult,MedicationCatalogMetadata} from '../worker/medication-catalog';

type Props={
 profileId:string, value:string, catalog:MedicationCatalogMetadata, isPet:boolean, disabled?:boolean,
 onNameChange:(name:string)=>void, onSelect:(result:CatalogResult)=>void,
 onProduct:(option:CatalogOption|null)=>void, onManual:()=>void
};
const explain='Directory matches are for identification only—not medical or veterinary dosage advice.';
export function MedicationCatalogPicker({profileId,value,catalog,isPet,disabled=false,onNameChange,onSelect,onProduct,onManual}:Props){
 const [results,setResults]=useState<CatalogResult[]>([]);
 const [selected,setSelected]=useState<CatalogResult|null>(null);
 const [focused,setFocused]=useState(false),[manual,setManual]=useState(false),[opened,setOpened]=useState(false);
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[searched,setSearched]=useState(false),[active,setActive]=useState(-1);
 const request=useRef(0);
 const listId=useId();
 const matched=!!catalog.catalogSource&&catalog.normalizedName===value;
 const term=value.trim();
 useEffect(()=>{
  if(!focused||manual||matched||term.length<2||!profileId||disabled){
   setResults([]);setLoading(false);setSearched(false);setOpened(false);
   return;
  }
  const id=++request.current;
  let live=true;
  setLoading(true);setError('');setSearched(false);setOpened(true);setActive(-1);
  const timeout=window.setTimeout(()=>{
   void api<{results:CatalogResult[]}>(`/medications/search?profileId=${encodeURIComponent(profileId)}&q=${encodeURIComponent(term)}`)
    .then(data=>{
     if(!live||id!==request.current)return;
     setResults(data.results);setSearched(true);setError('');
    })
    .catch(e=>{
     if(!live||id!==request.current||e instanceof StaleSessionRequest)return;
     setResults([]);setSearched(true);
     setError(e instanceof Error?e.message:'Medication search is unavailable. You can enter it manually.');
    }).finally(()=>{if(live&&id===request.current)setLoading(false);});
  },300);
  return()=>{live=false;request.current++;window.clearTimeout(timeout);};
 },[term,profileId,manual,matched,focused,disabled]);
 function choose(result:CatalogResult){
  request.current++;
  setSelected(result);setResults([]);setOpened(false);setFocused(false);
  setSearched(false);setActive(-1);setManual(false);setError('');
  onSelect(result);
 }
 function changeName(next:string){
  setSelected(null);setManual(false);setActive(-1);
  setOpened(true);onNameChange(next);
 }
 function manualEntry(){
  request.current++;
  setManual(true);setSelected(null);setResults([]);setOpened(false);setError('');
  setActive(-1);onManual();
 }
 function keys(event:KeyboardEvent<HTMLInputElement>){
  if(event.key==='Escape'){setOpened(false);setActive(-1);return;}
  if(!opened||results.length===0)return;
  if(event.key==='ArrowDown'){
   event.preventDefault();setActive(i=>Math.min(i+1,results.length-1));
  }else if(event.key==='ArrowUp'){
   event.preventDefault();setActive(i=>Math.max(i-1,0));
  }else if(event.key==='Enter'&&active>=0&&active<results.length){
   event.preventDefault();choose(results[active]);
  }
 }
 const listVisible=opened&&focused&&!manual&&!matched&&term.length>=2;
 const options=selected?.strengths||[];
 const productIndex=options.findIndex(x=>x.label===catalog.productStrength&&x.rxCui===catalog.catalogIdentifier);
 const strengthLabel=catalog.productStrength;
 return <div className="med-catalog" aria-label="Medication name lookup">
  <label htmlFor={listId+'-input'}>Medication name</label>
  <div className="med-catalog-input">
   <Search size={17} aria-hidden="true"/>
   <input id={listId+'-input'} role="combobox" aria-autocomplete="list"
    aria-controls={listId+'-options'} aria-expanded={listVisible} aria-haspopup="listbox"
    aria-activedescendant={listVisible&&active>=0?listId+'-option-'+active:undefined}
    required maxLength={150} autoComplete="off" spellCheck={false} value={value} disabled={disabled}
    placeholder="Search by brand or generic name"
    onFocus={()=>{setFocused(true);setOpened(true);}}
    onBlur={()=>{window.setTimeout(()=>{setFocused(false);setOpened(false);},130);}}
    onChange={e=>changeName(e.target.value)} onKeyDown={keys}/>
   {value&&<button type="button" className="med-catalog-clear" disabled={disabled} aria-label="Clear medication search" onClick={()=>{setSelected(null);setManual(false);onNameChange('');setOpened(false);}}><X size={16}/></button>}
  </div>
  {listVisible&&<div className="med-catalog-results">
   <div className="med-catalog-heading" role="status" aria-live="polite">
    {loading?'Searching the National Library of Medicine…':error?'Medication directory unavailable':!searched?'Searching…':results.length===0?'No directory matches':'Choose a medication (nothing is selected automatically)'}
   </div>
   {results.length>0&&<div id={listId+'-options'} role="listbox" aria-label="Medication search results" className="med-catalog-options">
    {results.map((item,i)=><button key={item.name+i} id={listId+'-option-'+i} type="button" role="option"
     aria-selected={i===active} className={i===active?'active':''}
     onMouseDown={e=>e.preventDefault()} onClick={()=>choose(item)}>
     <strong>{item.name}</strong>
     {item.synonyms.length>0&&<small>Also indexed as: {item.synonyms.slice(0,2).join(' · ')}</small>}
    </button>)}
   </div>}
   {error&&<p className="med-catalog-error" role="alert">{error}</p>}
   <button className="med-catalog-manual" type="button" onMouseDown={e=>e.preventDefault()} onClick={manualEntry}>Use custom medication name: “{value}”</button>
  </div>}
  {matched&&<div className="med-catalog-selection">
   <span><Check size={15}/> Selected from RxTerms (NLM)</span>
   {catalog.catalogIdentifier&&<small>RxCUI: {catalog.catalogIdentifier}</small>}
   <button type="button" className="quiet small" disabled={disabled} onClick={()=>{
     onManual();setSelected(null);setManual(false);setFocused(true);setOpened(true);
     document.getElementById(listId+'-input')?.focus();
   }}><RefreshCcw size={14}/> Search or change selection</button>
  </div>}
  {matched&&(options.length>0||strengthLabel)&&<div className="med-catalog-strength">
   <label htmlFor={listId+'-strength'}>Product strength and form (optional)</label>
   {options.length>0?<select id={listId+'-strength'} value={productIndex>=0?String(productIndex):''} disabled={disabled}
    onChange={e=>onProduct(e.target.value===''?null:options[Number(e.target.value)])}>
    <option value="">Choose a listed product strength/form</option>
    {options.map((item,i)=><option key={i} value={String(i)}>{item.label}</option>)}
   </select>:<div className="med-catalog-existing">
     <strong>{strengthLabel}</strong>
     <p className="muted tiny">Previously selected product. Search again to change it, or keep this identification.</p>
    </div>}
   <p className="med-catalog-hint">This describes the packaged product, not how much this person or pet should receive. Enter the exact prescribed dose separately below.</p>
  </div>}
  {manual&&<p className="med-catalog-manual-state"><Check size={15}/> Custom medication name. You can enter any medication, supplement, compounded preparation or veterinary prescription.</p>}
  {isPet&&<p className="med-catalog-pet">Veterinary note: this directory primarily lists human products. A match does not establish safety or appropriate dosing for an animal. Custom entry is always supported.</p>}
  <p className="med-catalog-hint">{explain}</p>
 </div>;
}
