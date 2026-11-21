import type {Audience} from '../../shared/audience';
export type Relationship='parent-child'|'parent-teen'|'child-parent'|'teen-parent'|'adult-adult'|'family';
export type Prompt={id:string,audience:Audience|'all',topic:string,text:string,relationship?:Relationship};
/** Static prompt copy only. No private journaling or activity is persisted. */
const starterPrompts:readonly Prompt[]=[
 {id:'p1',audience:'parent',topic:'Check-in',text:'What felt easier today, and what felt harder?'},
 {id:'p2',audience:'parent',topic:'Listening',text:'Would you like me to listen, help solve it, or just be with you?'},
 {id:'p3',audience:'parent',topic:'Autonomy',text:'Is there something you wish you had more say in lately?'},
 {id:'p4',audience:'parent',topic:'Connection',text:'Would talking, writing, or doing something side by side feel better?'},
 {id:'p5',audience:'parent',topic:'Small joys',text:'What is one little moment you want us to remember?'},
 {id:'p6',audience:'parent',topic:'Repair',text:'Is there something I could do differently to help you feel heard?'},
 {id:'p7',audience:'parent',topic:'Choice',text:'Would you rather choose when to talk about this?'},
 {id:'p8',audience:'parent',topic:'Support',text:'What kind of help would feel useful this week?'},
 {id:'k1',audience:'child',topic:'Feelings',text:'I feel ___ and I want you to know.'},
 {id:'k2',audience:'child',topic:'A little break',text:'Can we have a quiet moment together?'},
 {id:'k3',audience:'child',topic:'Listening',text:'Can I tell you what happened and you just listen?'},
 {id:'k4',audience:'child',topic:'Choice',text:'Can I point, draw, or write instead of talking?'},
 {id:'k5',audience:'child',topic:'Help',text:'This feels too big. Can you help me?'},
 {id:'k6',audience:'child',topic:'Space',text:'I need some time before I talk.'},
 {id:'k7',audience:'child',topic:'Connection',text:'Can we do something together, just us?'},
 {id:'k8',audience:'child',topic:'Repair',text:'Can we try that again?'},
 {id:'t1',audience:'teen',topic:'Being heard',text:'I want to tell you something without getting advice yet.'},
 {id:'t2',audience:'teen',topic:'Privacy',text:'There is something I want to keep private for now. Can we talk about what I am comfortable sharing?'},
 {id:'t3',audience:'teen',topic:'Independence',text:'Can we work out a decision where I have more say?'},
 {id:'t4',audience:'teen',topic:'Repair',text:'I think we misunderstood each other. Can I try explaining my side again?'},
 {id:'t5',audience:'teen',topic:'Space',text:'I need a little time to process. Can we check in later?'},
 {id:'t6',audience:'teen',topic:'Support',text:'I could use your support. I am not sure exactly what I need yet.'},
 {id:'t7',audience:'teen',topic:'Boundaries',text:'Can we agree on a better way to bring this up next time?'},
 {id:'t8',audience:'teen',topic:'Connection',text:'Want to spend some time together without making it a big conversation?'},
 {id:'a1',audience:'all',topic:'Gratitude',text:'One thing I appreciate about you is…'},
 {id:'a2',audience:'all',topic:'Care',text:'Something that helped me today was…'},
 {id:'a3',audience:'all',topic:'Together',text:'One small thing we could do together this week is…'},
];
/** Curated relationship-specific prompts are static copy, never telemetry. */
type Group={audience:Audience|'all',relationship:Relationship,topic:string,lines:string[]};
const groups:readonly Group[]=[
 {audience:'parent',relationship:'parent-child',topic:'Feelings',lines:[
  'Did something feel confusing today? We can figure it out together.',
  'Would you like to show me how you feel with a word, a drawing, or a face?',
  'Was there a moment today when you felt really proud or really upset?',
  'Is there a feeling you wish I noticed more often?'
 ]},
 {audience:'parent',relationship:'parent-child',topic:'Connection',lines:[
  'Would a little one-on-one time together feel good this week?',
  'What is something you would enjoy teaching me?',
  'Do you want a hug, some space, or to sit together?',
  'Is there a game or activity you would like us to do together?'
 ]},
 {audience:'parent',relationship:'parent-child',topic:'Asking for help',lines:[
  'Is there a part of your day that feels too hard to do alone?',
  'When something goes wrong, how can I make helping feel better?',
  'Would you like help starting, help finishing, or just company?',
  'What is one thing I could make a little easier tomorrow?'
 ]},
 {audience:'parent',relationship:'parent-child',topic:'Repairing conflict',lines:[
  'I think I missed what you were trying to tell me. Can we try again?',
  'Was there a time I sounded upset when you needed kindness?',
  'Is there something I should apologize for?',
  'What could we do differently the next time we disagree?'
 ]},
 {audience:'parent',relationship:'parent-child',topic:'Celebrating progress',lines:[
  'What did you try lately that took courage?',
  'Did you learn something about yourself this week?',
  'What small win deserves a celebration?',
  'What would you like to keep practicing at your own pace?'
 ]},
 {audience:'parent',relationship:'parent-teen',topic:'Being heard',lines:[
  'Is there something I have been misunderstanding about your perspective?',
  'Would you rather I listen first and hold off on advice?',
  'Do you feel there is room to disagree with me safely?',
  'What would help a conversation with me feel less loaded?'
 ]},
 {audience:'parent',relationship:'parent-teen',topic:'Boundaries and independence',lines:[
  'Where would you like more room to make your own decisions?',
  'Is there a boundary you want me to understand more clearly?',
  'What could I do to show trust while still checking on your safety?',
  'Can we revisit a rule that no longer seems to fit?'
 ]},
 {audience:'parent',relationship:'parent-teen',topic:'Trust and honesty',lines:[
  'Have I reacted in a way that made honesty feel harder?',
  'What helps you know you can tell me something uncomfortable?',
  'Is there a promise you wish I were better at keeping?',
  'What would rebuilding trust look like from your side?'
 ]},
 {audience:'parent',relationship:'parent-teen',topic:'Stress and overwhelm',lines:[
  'Is there anything quietly taking up a lot of your energy?',
  'What do you wish adults understood about your stress lately?',
  'Would time together help, or would you prefer room to recharge?',
  'What is one pressure we might be able to reduce together?'
 ]},
 {audience:'parent',relationship:'parent-teen',topic:'Difficult conversations',lines:[
  'Is there a subject you want to approach slowly, without having to explain everything at once?',
  'Would a written conversation make this easier than talking out loud?',
  'What do you need from me before we talk about something sensitive?',
  'You can tell me you are not ready. Would checking in another day feel better?'
 ]},
 {audience:'child',relationship:'child-parent',topic:'Feelings',lines:[
  'I felt left out when ___ happened.',
  'I had a big feeling today and I want someone to listen.',
  'Can you help me find words for how I feel?'
 ]},
 {audience:'child',relationship:'child-parent',topic:'Asking for help',lines:[
  'Could you help me with something that feels tricky?',
  'I want help, but I do not know how to ask.',
  'Can you stay near me while I try this?'
 ]},
 {audience:'child',relationship:'child-parent',topic:'Space',lines:[
  'I need a quiet break before we talk.',
  'Can we talk after I have had time to calm down?',
  'I want to be alone for a little bit, then reconnect.'
 ]},
 {audience:'child',relationship:'child-parent',topic:'School and daily life',lines:[
  'Something at school or at home has been on my mind.',
  'Can I tell you the best and hardest parts of my day?',
  'I want you to know what happened without being in trouble.'
 ]},
 {audience:'child',relationship:'child-parent',topic:'Appreciation',lines:[
  'Thank you for helping me when ___.',
  'One thing I like doing with you is ___.',
  'I noticed something kind you did for me.'
 ]},
 {audience:'teen',relationship:'teen-parent',topic:'Independence',lines:[
  'I would like more say in this decision. Can we work through it together?',
  'I need space to figure this out before hearing other opinions.',
  'I want you to trust me with a little more responsibility.'
 ]},
 {audience:'teen',relationship:'teen-parent',topic:'Overwhelm',lines:[
  'I have been carrying more stress than I have shown.',
  'I do not need solutions yet. I could use some understanding.',
  'I am overwhelmed and could use help making one thing manageable.'
 ]},
 {audience:'teen',relationship:'teen-parent',topic:'Repairing conflict',lines:[
  'I wish we could reset the tone of our last conversation.',
  'I felt dismissed when we talked about ___.',
  'I want to own my part, and I would like you to hear mine too.'
 ]},
 {audience:'teen',relationship:'teen-parent',topic:'Things that are hard to say',lines:[
  'Something matters to me that I am nervous to bring up.',
  'I am not ready to explain everything, but I want to start somewhere.',
  'Could you respond gently to what I am about to share?'
 ]},
 {audience:'teen',relationship:'teen-parent',topic:'Connection',lines:[
  'I miss feeling like we can just hang out without a serious talk.',
  'Could we plan time together where I choose the activity?',
  'I want to be closer, even if I have been quiet lately.'
 ]},
 {audience:'all',relationship:'family',topic:'Daily check-ins',lines:[
  'What was one moment today you would like to keep?',
  'What is one thing you hope goes a little better tomorrow?'
 ]},
 {audience:'all',relationship:'family',topic:'Gratitude',lines:[
  'Something I appreciate about our family lately is ___.',
  'Who helped you feel supported this week?'
 ]},
 {audience:'all',relationship:'family',topic:'Support and reassurance',lines:[
  'What kind of support would feel good right now?',
  'You do not have to answer quickly. I just want you to know I am here.'
 ]},
 {audience:'all',relationship:'family',topic:'Celebrating progress',lines:[
  'What small step are you glad you took?',
  'What is something we got through together?'
 ]},
 {audience:'all',relationship:'family',topic:'Connection',lines:[
  'What is one tradition you would like us to start?',
  'When do you feel most connected to the people around you?'
 ]}
];
const adultToAdult:readonly Prompt[]=[
 {id:'adult-1',audience:'parent',relationship:'adult-adult',topic:'Connection',text:'When have you felt most connected to me lately?'},
 {id:'adult-2',audience:'parent',relationship:'adult-adult',topic:'Connection',text:'What helps us feel like partners rather than just people managing a household?'},
 {id:'adult-3',audience:'parent',relationship:'adult-adult',topic:'Connection',text:'What ordinary moment together would you like more of?'},
 {id:'adult-4',audience:'parent',relationship:'adult-adult',topic:'Connection',text:'What is something we used to do together that you miss?'},
 {id:'adult-5',audience:'parent',relationship:'adult-adult',topic:'Appreciation',text:'What is one thing I do that makes you feel supported or understood?'},
 {id:'adult-6',audience:'parent',relationship:'adult-adult',topic:'Appreciation',text:'What effort of yours do you wish I noticed more?'},
 {id:'adult-7',audience:'parent',relationship:'adult-adult',topic:'Repair',text:'Is there a recent conversation you would like us to try again differently?'},
 {id:'adult-8',audience:'parent',relationship:'adult-adult',topic:'Repair',text:'When we disagree, what makes it easier for you to stay connected to me?'},
 {id:'adult-9',audience:'parent',relationship:'adult-adult',topic:'Repair',text:'When do you feel misunderstood by me, and what might help?'},
 {id:'adult-10',audience:'parent',relationship:'adult-adult',topic:'Shared load',text:'What responsibility has been weighing on you that I might not see?'},
 {id:'adult-11',audience:'parent',relationship:'adult-adult',topic:'Shared load',text:'What could we simplify together this week?'},
 {id:'adult-12',audience:'parent',relationship:'adult-adult',topic:'Shared load',text:'What would teamwork feel like in our current season of life?'},
 {id:'adult-13',audience:'parent',relationship:'adult-adult',topic:'Closeness',text:'What helps you feel cared for when you are tired or overwhelmed?'},
 {id:'adult-14',audience:'parent',relationship:'adult-adult',topic:'Closeness',text:'Is there a kind of affection or attention you would like more of?'},
 {id:'adult-15',audience:'parent',relationship:'adult-adult',topic:'Closeness',text:'When do you feel like we have room to be ourselves around each other?'},
 {id:'adult-16',audience:'parent',relationship:'adult-adult',topic:'Boundaries',text:'What is one boundary or personal need you would like me to respect better?'},
 {id:'adult-17',audience:'parent',relationship:'adult-adult',topic:'Boundaries',text:'How do we each want to balance time together and time alone?'},
 {id:'adult-18',audience:'parent',relationship:'adult-adult',topic:'Looking ahead',text:'What would make the next month feel meaningful for us?'},
 {id:'adult-19',audience:'parent',relationship:'adult-adult',topic:'Looking ahead',text:'What is one dream or hope we have not talked about in a while?'},
 {id:'adult-20',audience:'parent',relationship:'adult-adult',topic:'Honesty',text:'What conversation have we been putting off that deserves a kind beginning?'}
];
export const prompts:readonly Prompt[]=[
 ...starterPrompts, ...adultToAdult,
 ...groups.flatMap((group,index)=>group.lines.map((line,offset)=>({
  id:'curated-'+index+'-'+offset,audience:group.audience,relationship:group.relationship,topic:group.topic,text:line
 })))
];
export const RELATIONSHIP_LABELS:Record<Relationship,string>={
 'parent-child':'Parent → Child','parent-teen':'Parent → Teen',
 'child-parent':'Child → Parent','teen-parent':'Teen → Parent','adult-adult':'Adult ↔ Adult','family':'Family'
};
export function relationshipOptions(audience:Audience):Relationship[]{
 return audience==='parent'?['adult-adult','parent-child','parent-teen','family']:
  audience==='child'?['child-parent','family']:['teen-parent','family'];
}
/** A shuffle bag: do not repeat until the current filtered set is exhausted. */
export function rotatePrompt(list:readonly Prompt[],seen:readonly string[],previousId:string|null,random=Math.random):
 {prompt:Prompt|null,seen:string[]}{
 if(!list.length)return {prompt:null,seen:[]};
 let pool=list.filter(p=>!seen.includes(p.id));
 let reset=false;
 if(!pool.length){pool=list.filter(p=>p.id!==previousId);reset=true;}
 if(!pool.length)pool=[...list];
 const index=Math.min(pool.length-1,Math.max(0,Math.floor(random()*pool.length)));
 const picked=pool[index];
 return {prompt:picked,seen:reset?[picked.id]:[...seen,picked.id]};
}

export function promptsForAudience(audience:Audience):Prompt[]{
 return prompts.filter(p=>p.audience==='all'||p.audience===audience);
}
