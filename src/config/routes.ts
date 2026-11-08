import type { LucideIcon } from 'lucide-react';
import { Archive, Home as HomeIcon, Goal, LifeBuoy, Settings, UserRound, Swords, ClipboardList, ChartNoAxesCombined, Sparkles, PlaySquare, SlidersHorizontal } from 'lucide-react';

export type Scope = 'normal';
export type RouteId = 'home'|'play'|'analytics'|'assistant'|'account-hub'|'archive'|'match-center'|'tactical'|'profile'|'support'|'settings'|'stadiums';
export type RouteSection = 'core'|'football'|'personal'|'system';
export type RouteMeta={id:RouteId;icon:LucideIcon;label:{ar:string;en:string};scopes:Scope[];showInMobileNav:boolean;showInDesktopNav:boolean;section:RouteSection};
export const routeRegistry:RouteMeta[]=[
 {id:'home',icon:HomeIcon,label:{ar:'الرئيسية',en:'Home'},scopes:['normal'],showInMobileNav:true,showInDesktopNav:true,section:'core'},
 {id:'stadiums',icon:Goal,label:{ar:'الملاعب',en:'Stadiums'},scopes:['normal'],showInMobileNav:true,showInDesktopNav:true,section:'football'},
 {id:'play',icon:PlaySquare,label:{ar:'مساحة اللعب',en:'Play Space'},scopes:['normal'],showInMobileNav:true,showInDesktopNav:true,section:'football'},
 {id:'analytics',icon:ChartNoAxesCombined,label:{ar:'تحليلاتي',en:'My Analytics'},scopes:['normal'],showInMobileNav:true,showInDesktopNav:true,section:'football'},
 {id:'assistant',icon:Sparkles,label:{ar:'TAAMEN AI',en:'TAAMEN AI'},scopes:['normal'],showInMobileNav:true,showInDesktopNav:true,section:'football'},
 {id:'match-center',icon:ClipboardList,label:{ar:'مركز المباريات',en:'Match Center'},scopes:['normal'],showInMobileNav:false,showInDesktopNav:false,section:'football'},
 {id:'archive',icon:Archive,label:{ar:'الأرشيف',en:'Archive'},scopes:['normal'],showInMobileNav:false,showInDesktopNav:false,section:'football'},
 {id:'profile',icon:UserRound,label:{ar:'الملف الشخصي',en:'Profile'},scopes:['normal'],showInMobileNav:false,showInDesktopNav:false,section:'personal'},
 {id:'tactical',icon:Swords,label:{ar:'الملعب التكتيكي',en:'Tactical Playground'},scopes:['normal'],showInMobileNav:false,showInDesktopNav:false,section:'football'},
 {id:'account-hub',icon:SlidersHorizontal,label:{ar:'الحساب والإعدادات',en:'Account & Settings'},scopes:['normal'],showInMobileNav:false,showInDesktopNav:false,section:'system'},
 {id:'support',icon:LifeBuoy,label:{ar:'الدعم',en:'Support'},scopes:['normal'],showInMobileNav:false,showInDesktopNav:false,section:'system'},
 {id:'settings',icon:Settings,label:{ar:'الإعدادات',en:'Settings'},scopes:['normal'],showInMobileNav:false,showInDesktopNav:false,section:'system'},
];
export function routesForScope(scope:Scope){return routeRegistry.filter(r=>r.scopes.includes(scope))}
export function routesForMobileNav(scope:Scope){return routesForScope(scope).filter(r=>r.showInMobileNav)}
export function routesForDesktopNav(scope:Scope){return routesForScope(scope).filter(r=>r.showInDesktopNav)}
export function routesBySection(scope:Scope){const routes=routesForDesktopNav(scope);const sections:Record<RouteSection,typeof routes>={core:[],football:[],personal:[],system:[]};routes.forEach(r=>sections[r.section].push(r));return sections}
