-- Unambiguous, consistent college display names (2026-10-27)
--
-- The site shows `short_name ?? name`. Before this patch two colleges shared CMU / UWA / NSU / TSU / WSU / UNO /
-- Southeastern, the University of Kentucky showed as "UK" (also the UK region switch), and many colleges showed long
-- IPEDS names ("Pennsylvania State University-Main Campus"). The same values are in data/colleges/*.json, so a future
-- re-seed produces the same names. scripts/build_seed.py now fails on duplicate display names or region-code names.
--
-- 193 UPDATEs, one per changed college, keyed by slug. Safe to re-run (sets absolute values).
-- Run in the Supabase SQL Editor (UPDATE via the MCP waits for owner approval).
--
-- slug | previous display name -> new short_name
--   alberta | U of A -> Alberta
--   arkansas-state | A-State -> Arkansas State
--   arkansas-tech | ATU -> Arkansas Tech
--   augustana-il | Augustana -> Augustana (IL)
--   aum | AUM -> Auburn Montgomery
--   austin-peay | APSU -> Austin Peay
--   azusa-pacific | APU -> Azusa Pacific
--   black-hills-state | BHSU -> Black Hills State
--   boston-college | BC -> Boston College
--   boston-university | BU -> Boston University
--   bowling-green | BGSU -> Bowling Green
--   cal-state-bakersfield | CSUB -> Cal State Bakersfield
--   cal-state-dominguez-hills | CSUDH -> Cal State Dominguez Hills
--   cal-state-monterey-bay | CSUMB -> Cal State Monterey Bay
--   cal-state-san-marcos | CSUSM -> Cal State San Marcos
--   calgary | UCalgary -> Calgary
--   carnegie-mellon | CMU -> Carnegie Mellon
--   case-western | Case Western Reserve University -> Case Western
--   catholic-university | CUA -> Catholic University
--   central-connecticut | CCSU -> Central Connecticut
--   central-michigan | CMU -> Central Michigan
--   central-oklahoma | UCO -> Central Oklahoma
--   central-washington | CWU -> Central Washington
--   cincinnati | UC -> Cincinnati
--   claremont-mckenna | Claremont McKenna College -> Claremont McKenna
--   colorado-state | Colorado State University (Fort Collins) -> Colorado State
--   columbia | Columbia University in the City of New York -> Columbia
--   columbia-college-chicago | Columbia Chicago -> Columbia College Chicago
--   commonwealth-pa | Commonwealth U -> Commonwealth University
--   csu-pueblo | CSU Pueblo -> Colorado State Pueblo
--   csun | CSUN -> Cal State Northridge
--   cu-boulder | University of Colorado Boulder -> CU Boulder
--   cuny-staten-island | CSI -> College of Staten Island
--   dallas-baptist | DBU -> Dallas Baptist
--   east-carolina | ECU -> East Carolina
--   east-tennessee-state | ETSU -> East Tennessee State
--   eastern-illinois | EIU -> Eastern Illinois
--   eastern-kentucky | EKU -> Eastern Kentucky
--   eastern-michigan | EMU -> Eastern Michigan
--   eastern-university | Eastern -> Eastern University
--   fgcu | FGCU -> Florida Gulf Coast
--   florida-atlantic | FAU -> Florida Atlantic
--   florida-state | Florida State University -> Florida State
--   fort-hays-state | FHSU -> Fort Hays State
--   georgia-gwinnett | GGC -> Georgia Gwinnett
--   georgia-southern | Georgia Southern University -> Georgia Southern
--   georgia-southwestern | GSW -> Georgia Southwestern
--   grand-valley | GVSU -> Grand Valley State
--   gwu | George Washington University -> George Washington
--   hawaii-pacific | HPU -> Hawaii Pacific
--   houston-christian | HCU -> Houston Christian
--   idaho | U of I -> Idaho
--   incarnate-word | UIW -> Incarnate Word
--   indiana | Indiana University-Bloomington -> IU Bloomington
--   iup | IUP -> IUP (Indiana, PA)
--   jacksonville-state | JSU -> Jacksonville State
--   johns-hopkins | Johns Hopkins University -> Johns Hopkins
--   johnson-wales | JWU Providence -> Johnson & Wales (RI)
--   kansas | KU -> Kansas
--   kansas-state | K-State -> Kansas State
--   kennesaw-state | KSU -> Kennesaw State
--   kentucky | UK -> Kentucky
--   kings-college-london | King's -> King's College London
--   lewis-clark-state | LC State -> Lewis-Clark State
--   louisville | UofL -> Louisville
--   lsu-alexandria | LSUA -> LSU Alexandria
--   lsu-shreveport | LSUS -> LSU Shreveport
--   maine | UMaine -> Maine
--   maine-presque-isle | UMPI -> Maine Presque Isle
--   marian-in | Marian -> Marian (IN)
--   metro-state-mn | Metro State -> Metro State (MN)
--   michigan-state | Michigan State University -> Michigan State
--   middle-georgia-state | MGA -> Middle Georgia State
--   middle-tennessee | MTSU -> Middle Tennessee
--   midwestern-state | MSU Texas -> Midwestern State
--   missouri-southern | MSSU -> Missouri Southern
--   montana | UM -> Montana
--   montana-state | MSU -> Montana State
--   ndsu | NDSU -> North Dakota State
--   nebraska-kearney | UNK -> Nebraska Kearney
--   nebraska-omaha | UNO -> Nebraska Omaha
--   nevada-reno | Nevada -> Nevada Reno
--   new-orleans | UNO -> LSU New Orleans
--   nmsu | NMSU -> New Mexico State
--   north-alabama | UNA -> North Alabama
--   north-georgia | UNG -> North Georgia
--   northeastern-state | NSU -> Northeastern State
--   northern-arizona | NAU -> Northern Arizona
--   northern-colorado | University of Northern Colorado -> Northern Colorado
--   northern-iowa | UNI -> Northern Iowa
--   northern-kentucky | NKU -> Northern Kentucky
--   northern-state | NSU -> Northern State (SD)
--   northwest-missouri-state | Northwest -> Northwest Missouri State
--   notre-dame | University of Notre Dame -> Notre Dame
--   oakland | OU -> Oakland
--   ohio-state | Ohio State University-Main Campus -> Ohio State
--   old-dominion | ODU -> Old Dominion
--   olivet-nazarene | ONU -> Olivet Nazarene
--   oral-roberts | ORU -> Oral Roberts
--   pacific-lutheran | PLU -> Pacific Lutheran
--   palm-beach-atlantic | PBA -> Palm Beach Atlantic
--   penn-state | Pennsylvania State University-Main Campus -> Penn State
--   pitt | University of Pittsburgh-Pittsburgh Campus -> Pitt
--   pittsburg-state | Pitt State -> Pittsburg State
--   portland-state | PSU -> Portland State
--   prairie-view-am | PVAMU -> Prairie View A&M
--   purdue-fort-wayne | PFW -> Purdue Fort Wayne
--   purdue-northwest | PNW -> Purdue Northwest
--   queens-university | Queen's -> Queen's University
--   rhode-island | URI -> Rhode Island
--   rit | Rochester Institute of Technology -> RIT
--   robert-morris | RMU -> Robert Morris
--   rpi | Rensselaer Polytechnic Institute -> RPI
--   rutgers | Rutgers University-New Brunswick -> Rutgers
--   saginaw-valley | SVSU -> Saginaw Valley State
--   sam-houston-state | SHSU -> Sam Houston State
--   san-jose-state | SJSU -> San Jose State
--   siue | SIUE -> SIU Edwardsville
--   slippery-rock | SRU -> Slippery Rock
--   smu | Southern Methodist University -> SMU
--   south-dakota | USD -> South Dakota
--   south-dakota-state | SDSU -> South Dakota State
--   southeast-missouri-state | SEMO -> Southeast Missouri State
--   southeastern-louisiana | Southeastern -> Southeastern Louisiana
--   southeastern-oklahoma | Southeastern -> Southeastern Oklahoma
--   southern-adventist | Southern -> Southern Adventist
--   southern-indiana | USI -> Southern Indiana
--   southern-maine | USM -> Southern Maine
--   southern-utah | SUU -> Southern Utah
--   southwestern-oklahoma | SWOSU -> Southwestern Oklahoma
--   st-cloud-state | SCSU -> St. Cloud State
--   st-marys-tx | St. Mary's -> St. Mary's (TX)
--   st-thomas-fl | STU -> St. Thomas (FL)
--   stephen-f-austin | SFA -> Stephen F. Austin
--   stevens | Stevens Institute of Technology -> Stevens
--   tamu-corpus-christi | TAMU-CC -> Texas A&M Corpus Christi
--   tamu-kingsville | Texas A&M-Kingsville -> Texas A&M Kingsville
--   tamu-san-antonio | A&M-San Antonio -> Texas A&M San Antonio
--   tennessee-state | TSU -> Tennessee State
--   texas-am | Texas A&M University-College Station -> Texas A&M
--   texas-southern | TSU -> Texas Southern
--   texas-womans | TWU -> Texas Woman's
--   toledo | UToledo -> Toledo
--   toronto | U of T -> Toronto
--   tulane | Tulane University of Louisiana -> Tulane
--   uafs | UAFS -> Arkansas Fort Smith
--   uc-davis | University of California-Davis -> UC Davis
--   uc-irvine | University of California-Irvine -> UC Irvine
--   uc-riverside | University of California-Riverside -> UC Riverside
--   uc-san-diego | University of California-San Diego -> UC San Diego
--   uc-santa-barbara | University of California-Santa Barbara -> UC Santa Barbara
--   uc-santa-cruz | University of California-Santa Cruz -> UC Santa Cruz
--   ucla | University of California-Los Angeles -> UCLA
--   uconn | University of Connecticut -> UConn
--   uh-clear-lake | UHCL -> UH Clear Lake
--   uh-downtown | UHD -> UH Downtown
--   uh-victoria | A&M-Victoria -> Texas A&M Victoria
--   uis | UIS -> Illinois Springfield
--   ul-monroe | ULM -> Louisiana Monroe
--   um-flint | UM-Flint -> Michigan Flint
--   umass-amherst | University of Massachusetts-Amherst -> UMass Amherst
--   umes | UMES -> Maryland Eastern Shore
--   umn | University of Minnesota-Twin Cities -> Minnesota Twin Cities
--   unc | University of North Carolina at Chapel Hill -> UNC Chapel Hill
--   upenn | University of Pennsylvania -> Penn
--   usc | University of Southern California -> USC
--   ut-austin | The University of Texas at Austin -> UT Austin
--   ut-chattanooga | UTC -> UT Chattanooga
--   ut-permian-basin | UTPB -> UT Permian Basin
--   utrgv | UTRGV -> UT Rio Grande Valley
--   uva | University of Virginia-Main Campus -> UVA
--   uw-madison | University of Wisconsin-Madison -> UW-Madison
--   uw-milwaukee | UWM -> UW-Milwaukee
--   uw-oshkosh | UW Oshkosh -> UW-Oshkosh
--   uw-river-falls | UWRF -> UW-River Falls
--   uw-seattle | University of Washington-Seattle Campus -> UW Seattle
--   uwa | UWA -> Western Australia
--   valdosta-state | VSU -> Valdosta State
--   vermont-state | VTSU -> Vermont State
--   virginia-tech | Virginia Polytechnic Institute and State University -> Virginia Tech
--   washington-state | WSU -> Washington State
--   washu | Washington University in St Louis -> WashU
--   west-alabama | UWA -> West Alabama
--   west-texas-am | WTAMU -> West Texas A&M
--   west-virginia-state | WVSU -> West Virginia State
--   western-carolina | WCU -> Western Carolina
--   western-kentucky | WKU -> Western Kentucky
--   western-michigan | WMU -> Western Michigan
--   western-university | Western -> Western University
--   winona-state | WSU -> Winona State
--   wpi | Worcester Polytechnic Institute -> WPI
--   wyoming | UW -> Wyoming
--   youngstown-state | YSU -> Youngstown State

begin;

update public.institutions set short_name = 'Alberta' where slug = 'alberta';
update public.institutions set short_name = 'Arkansas State' where slug = 'arkansas-state';
update public.institutions set short_name = 'Arkansas Tech' where slug = 'arkansas-tech';
update public.institutions set short_name = 'Augustana (IL)' where slug = 'augustana-il';
update public.institutions set short_name = 'Auburn Montgomery' where slug = 'aum';
update public.institutions set short_name = 'Austin Peay' where slug = 'austin-peay';
update public.institutions set short_name = 'Azusa Pacific' where slug = 'azusa-pacific';
update public.institutions set short_name = 'Black Hills State' where slug = 'black-hills-state';
update public.institutions set short_name = 'Boston College' where slug = 'boston-college';
update public.institutions set short_name = 'Boston University' where slug = 'boston-university';
update public.institutions set short_name = 'Bowling Green' where slug = 'bowling-green';
update public.institutions set short_name = 'Cal State Bakersfield' where slug = 'cal-state-bakersfield';
update public.institutions set short_name = 'Cal State Dominguez Hills' where slug = 'cal-state-dominguez-hills';
update public.institutions set short_name = 'Cal State Monterey Bay' where slug = 'cal-state-monterey-bay';
update public.institutions set short_name = 'Cal State San Marcos' where slug = 'cal-state-san-marcos';
update public.institutions set short_name = 'Calgary' where slug = 'calgary';
update public.institutions set short_name = 'Carnegie Mellon' where slug = 'carnegie-mellon';
update public.institutions set short_name = 'Case Western' where slug = 'case-western';
update public.institutions set short_name = 'Catholic University' where slug = 'catholic-university';
update public.institutions set short_name = 'Central Connecticut' where slug = 'central-connecticut';
update public.institutions set short_name = 'Central Michigan' where slug = 'central-michigan';
update public.institutions set short_name = 'Central Oklahoma' where slug = 'central-oklahoma';
update public.institutions set short_name = 'Central Washington' where slug = 'central-washington';
update public.institutions set short_name = 'Cincinnati' where slug = 'cincinnati';
update public.institutions set short_name = 'Claremont McKenna' where slug = 'claremont-mckenna';
update public.institutions set short_name = 'Colorado State' where slug = 'colorado-state';
update public.institutions set short_name = 'Columbia' where slug = 'columbia';
update public.institutions set short_name = 'Columbia College Chicago' where slug = 'columbia-college-chicago';
update public.institutions set short_name = 'Commonwealth University' where slug = 'commonwealth-pa';
update public.institutions set short_name = 'Colorado State Pueblo' where slug = 'csu-pueblo';
update public.institutions set short_name = 'Cal State Northridge' where slug = 'csun';
update public.institutions set short_name = 'CU Boulder' where slug = 'cu-boulder';
update public.institutions set short_name = 'College of Staten Island' where slug = 'cuny-staten-island';
update public.institutions set short_name = 'Dallas Baptist' where slug = 'dallas-baptist';
update public.institutions set short_name = 'East Carolina' where slug = 'east-carolina';
update public.institutions set short_name = 'East Tennessee State' where slug = 'east-tennessee-state';
update public.institutions set short_name = 'Eastern Illinois' where slug = 'eastern-illinois';
update public.institutions set short_name = 'Eastern Kentucky' where slug = 'eastern-kentucky';
update public.institutions set short_name = 'Eastern Michigan' where slug = 'eastern-michigan';
update public.institutions set short_name = 'Eastern University' where slug = 'eastern-university';
update public.institutions set short_name = 'Florida Gulf Coast' where slug = 'fgcu';
update public.institutions set short_name = 'Florida Atlantic' where slug = 'florida-atlantic';
update public.institutions set short_name = 'Florida State' where slug = 'florida-state';
update public.institutions set short_name = 'Fort Hays State' where slug = 'fort-hays-state';
update public.institutions set short_name = 'Georgia Gwinnett' where slug = 'georgia-gwinnett';
update public.institutions set short_name = 'Georgia Southern' where slug = 'georgia-southern';
update public.institutions set short_name = 'Georgia Southwestern' where slug = 'georgia-southwestern';
update public.institutions set short_name = 'Grand Valley State' where slug = 'grand-valley';
update public.institutions set short_name = 'George Washington' where slug = 'gwu';
update public.institutions set short_name = 'Hawaii Pacific' where slug = 'hawaii-pacific';
update public.institutions set short_name = 'Houston Christian' where slug = 'houston-christian';
update public.institutions set short_name = 'Idaho' where slug = 'idaho';
update public.institutions set short_name = 'Incarnate Word' where slug = 'incarnate-word';
update public.institutions set short_name = 'IU Bloomington' where slug = 'indiana';
update public.institutions set short_name = 'IUP (Indiana, PA)' where slug = 'iup';
update public.institutions set short_name = 'Jacksonville State' where slug = 'jacksonville-state';
update public.institutions set short_name = 'Johns Hopkins' where slug = 'johns-hopkins';
update public.institutions set short_name = 'Johnson & Wales (RI)' where slug = 'johnson-wales';
update public.institutions set short_name = 'Kansas' where slug = 'kansas';
update public.institutions set short_name = 'Kansas State' where slug = 'kansas-state';
update public.institutions set short_name = 'Kennesaw State' where slug = 'kennesaw-state';
update public.institutions set short_name = 'Kentucky' where slug = 'kentucky';
update public.institutions set short_name = 'King''s College London' where slug = 'kings-college-london';
update public.institutions set short_name = 'Lewis-Clark State' where slug = 'lewis-clark-state';
update public.institutions set short_name = 'Louisville' where slug = 'louisville';
update public.institutions set short_name = 'LSU Alexandria' where slug = 'lsu-alexandria';
update public.institutions set short_name = 'LSU Shreveport' where slug = 'lsu-shreveport';
update public.institutions set short_name = 'Maine' where slug = 'maine';
update public.institutions set short_name = 'Maine Presque Isle' where slug = 'maine-presque-isle';
update public.institutions set short_name = 'Marian (IN)' where slug = 'marian-in';
update public.institutions set short_name = 'Metro State (MN)' where slug = 'metro-state-mn';
update public.institutions set short_name = 'Michigan State' where slug = 'michigan-state';
update public.institutions set short_name = 'Middle Georgia State' where slug = 'middle-georgia-state';
update public.institutions set short_name = 'Middle Tennessee' where slug = 'middle-tennessee';
update public.institutions set short_name = 'Midwestern State' where slug = 'midwestern-state';
update public.institutions set short_name = 'Missouri Southern' where slug = 'missouri-southern';
update public.institutions set short_name = 'Montana' where slug = 'montana';
update public.institutions set short_name = 'Montana State' where slug = 'montana-state';
update public.institutions set short_name = 'North Dakota State' where slug = 'ndsu';
update public.institutions set short_name = 'Nebraska Kearney' where slug = 'nebraska-kearney';
update public.institutions set short_name = 'Nebraska Omaha' where slug = 'nebraska-omaha';
update public.institutions set short_name = 'Nevada Reno' where slug = 'nevada-reno';
update public.institutions set short_name = 'LSU New Orleans' where slug = 'new-orleans';
update public.institutions set short_name = 'New Mexico State' where slug = 'nmsu';
update public.institutions set short_name = 'North Alabama' where slug = 'north-alabama';
update public.institutions set short_name = 'North Georgia' where slug = 'north-georgia';
update public.institutions set short_name = 'Northeastern State' where slug = 'northeastern-state';
update public.institutions set short_name = 'Northern Arizona' where slug = 'northern-arizona';
update public.institutions set short_name = 'Northern Colorado' where slug = 'northern-colorado';
update public.institutions set short_name = 'Northern Iowa' where slug = 'northern-iowa';
update public.institutions set short_name = 'Northern Kentucky' where slug = 'northern-kentucky';
update public.institutions set short_name = 'Northern State (SD)' where slug = 'northern-state';
update public.institutions set short_name = 'Northwest Missouri State' where slug = 'northwest-missouri-state';
update public.institutions set short_name = 'Notre Dame' where slug = 'notre-dame';
update public.institutions set short_name = 'Oakland' where slug = 'oakland';
update public.institutions set short_name = 'Ohio State' where slug = 'ohio-state';
update public.institutions set short_name = 'Old Dominion' where slug = 'old-dominion';
update public.institutions set short_name = 'Olivet Nazarene' where slug = 'olivet-nazarene';
update public.institutions set short_name = 'Oral Roberts' where slug = 'oral-roberts';
update public.institutions set short_name = 'Pacific Lutheran' where slug = 'pacific-lutheran';
update public.institutions set short_name = 'Palm Beach Atlantic' where slug = 'palm-beach-atlantic';
update public.institutions set short_name = 'Penn State' where slug = 'penn-state';
update public.institutions set short_name = 'Pitt' where slug = 'pitt';
update public.institutions set short_name = 'Pittsburg State' where slug = 'pittsburg-state';
update public.institutions set short_name = 'Portland State' where slug = 'portland-state';
update public.institutions set short_name = 'Prairie View A&M' where slug = 'prairie-view-am';
update public.institutions set short_name = 'Purdue Fort Wayne' where slug = 'purdue-fort-wayne';
update public.institutions set short_name = 'Purdue Northwest' where slug = 'purdue-northwest';
update public.institutions set short_name = 'Queen''s University' where slug = 'queens-university';
update public.institutions set short_name = 'Rhode Island' where slug = 'rhode-island';
update public.institutions set short_name = 'RIT' where slug = 'rit';
update public.institutions set short_name = 'Robert Morris' where slug = 'robert-morris';
update public.institutions set short_name = 'RPI' where slug = 'rpi';
update public.institutions set short_name = 'Rutgers' where slug = 'rutgers';
update public.institutions set short_name = 'Saginaw Valley State' where slug = 'saginaw-valley';
update public.institutions set short_name = 'Sam Houston State' where slug = 'sam-houston-state';
update public.institutions set short_name = 'San Jose State' where slug = 'san-jose-state';
update public.institutions set short_name = 'SIU Edwardsville' where slug = 'siue';
update public.institutions set short_name = 'Slippery Rock' where slug = 'slippery-rock';
update public.institutions set short_name = 'SMU' where slug = 'smu';
update public.institutions set short_name = 'South Dakota' where slug = 'south-dakota';
update public.institutions set short_name = 'South Dakota State' where slug = 'south-dakota-state';
update public.institutions set short_name = 'Southeast Missouri State' where slug = 'southeast-missouri-state';
update public.institutions set short_name = 'Southeastern Louisiana' where slug = 'southeastern-louisiana';
update public.institutions set short_name = 'Southeastern Oklahoma' where slug = 'southeastern-oklahoma';
update public.institutions set short_name = 'Southern Adventist' where slug = 'southern-adventist';
update public.institutions set short_name = 'Southern Indiana' where slug = 'southern-indiana';
update public.institutions set short_name = 'Southern Maine' where slug = 'southern-maine';
update public.institutions set short_name = 'Southern Utah' where slug = 'southern-utah';
update public.institutions set short_name = 'Southwestern Oklahoma' where slug = 'southwestern-oklahoma';
update public.institutions set short_name = 'St. Cloud State' where slug = 'st-cloud-state';
update public.institutions set short_name = 'St. Mary''s (TX)' where slug = 'st-marys-tx';
update public.institutions set short_name = 'St. Thomas (FL)' where slug = 'st-thomas-fl';
update public.institutions set short_name = 'Stephen F. Austin' where slug = 'stephen-f-austin';
update public.institutions set short_name = 'Stevens' where slug = 'stevens';
update public.institutions set short_name = 'Texas A&M Corpus Christi' where slug = 'tamu-corpus-christi';
update public.institutions set short_name = 'Texas A&M Kingsville' where slug = 'tamu-kingsville';
update public.institutions set short_name = 'Texas A&M San Antonio' where slug = 'tamu-san-antonio';
update public.institutions set short_name = 'Tennessee State' where slug = 'tennessee-state';
update public.institutions set short_name = 'Texas A&M' where slug = 'texas-am';
update public.institutions set short_name = 'Texas Southern' where slug = 'texas-southern';
update public.institutions set short_name = 'Texas Woman''s' where slug = 'texas-womans';
update public.institutions set short_name = 'Toledo' where slug = 'toledo';
update public.institutions set short_name = 'Toronto' where slug = 'toronto';
update public.institutions set short_name = 'Tulane' where slug = 'tulane';
update public.institutions set short_name = 'Arkansas Fort Smith' where slug = 'uafs';
update public.institutions set short_name = 'UC Davis' where slug = 'uc-davis';
update public.institutions set short_name = 'UC Irvine' where slug = 'uc-irvine';
update public.institutions set short_name = 'UC Riverside' where slug = 'uc-riverside';
update public.institutions set short_name = 'UC San Diego' where slug = 'uc-san-diego';
update public.institutions set short_name = 'UC Santa Barbara' where slug = 'uc-santa-barbara';
update public.institutions set short_name = 'UC Santa Cruz' where slug = 'uc-santa-cruz';
update public.institutions set short_name = 'UCLA' where slug = 'ucla';
update public.institutions set short_name = 'UConn' where slug = 'uconn';
update public.institutions set short_name = 'UH Clear Lake' where slug = 'uh-clear-lake';
update public.institutions set short_name = 'UH Downtown' where slug = 'uh-downtown';
update public.institutions set short_name = 'Texas A&M Victoria' where slug = 'uh-victoria';
update public.institutions set short_name = 'Illinois Springfield' where slug = 'uis';
update public.institutions set short_name = 'Louisiana Monroe' where slug = 'ul-monroe';
update public.institutions set short_name = 'Michigan Flint' where slug = 'um-flint';
update public.institutions set short_name = 'UMass Amherst' where slug = 'umass-amherst';
update public.institutions set short_name = 'Maryland Eastern Shore' where slug = 'umes';
update public.institutions set short_name = 'Minnesota Twin Cities' where slug = 'umn';
update public.institutions set short_name = 'UNC Chapel Hill' where slug = 'unc';
update public.institutions set short_name = 'Penn' where slug = 'upenn';
update public.institutions set short_name = 'USC' where slug = 'usc';
update public.institutions set short_name = 'UT Austin' where slug = 'ut-austin';
update public.institutions set short_name = 'UT Chattanooga' where slug = 'ut-chattanooga';
update public.institutions set short_name = 'UT Permian Basin' where slug = 'ut-permian-basin';
update public.institutions set short_name = 'UT Rio Grande Valley' where slug = 'utrgv';
update public.institutions set short_name = 'UVA' where slug = 'uva';
update public.institutions set short_name = 'UW-Madison' where slug = 'uw-madison';
update public.institutions set short_name = 'UW-Milwaukee' where slug = 'uw-milwaukee';
update public.institutions set short_name = 'UW-Oshkosh' where slug = 'uw-oshkosh';
update public.institutions set short_name = 'UW-River Falls' where slug = 'uw-river-falls';
update public.institutions set short_name = 'UW Seattle' where slug = 'uw-seattle';
update public.institutions set short_name = 'Western Australia' where slug = 'uwa';
update public.institutions set short_name = 'Valdosta State' where slug = 'valdosta-state';
update public.institutions set short_name = 'Vermont State' where slug = 'vermont-state';
update public.institutions set short_name = 'Virginia Tech' where slug = 'virginia-tech';
update public.institutions set short_name = 'Washington State' where slug = 'washington-state';
update public.institutions set short_name = 'WashU' where slug = 'washu';
update public.institutions set short_name = 'West Alabama' where slug = 'west-alabama';
update public.institutions set short_name = 'West Texas A&M' where slug = 'west-texas-am';
update public.institutions set short_name = 'West Virginia State' where slug = 'west-virginia-state';
update public.institutions set short_name = 'Western Carolina' where slug = 'western-carolina';
update public.institutions set short_name = 'Western Kentucky' where slug = 'western-kentucky';
update public.institutions set short_name = 'Western Michigan' where slug = 'western-michigan';
update public.institutions set short_name = 'Western University' where slug = 'western-university';
update public.institutions set short_name = 'Winona State' where slug = 'winona-state';
update public.institutions set short_name = 'WPI' where slug = 'wpi';
update public.institutions set short_name = 'Wyoming' where slug = 'wyoming';
update public.institutions set short_name = 'Youngstown State' where slug = 'youngstown-state';

commit;
