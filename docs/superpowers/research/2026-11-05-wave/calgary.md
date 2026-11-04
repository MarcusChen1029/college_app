<!-- Copied from the Task 11 wave workspace on 2026-11-05. The research agents' own words; the integration notes at
     the end say what went into data/. -->

# calgary (CA1)
No files changed (copies of current files). researched false.
The ucalgary.ca admissions pages redirected to a maintenance site (coldsite-ucalgary.azurewebsites.net, "experiencing technical issues") on 2026-11-05, so nothing was scraped.
Search summary only (not used for any row): fall 2027 application stays open until 1 March 2027 (application opens 15 Aug international); an older page says 1 Apr; the existing row (1 Apr 2027) conflicts with the 1 Mar date on the dates page that the file's own notes already mention. Re-check when the site is back. BHSc has a supplementary application due 1 Mar 2027 (not one of our courses). Fee $145 international (summary).
Fall 2026 how-to-apply page (discover.ucalgary.ca/portal/howtoapply_2026, scraped) gives 1 Mar 2026 for everyone, which supports 1 Mar as the real closing date.
Not found: document deadline, offer acceptance / deposit, scholarship dates, any extra steps for Computer Science, Economics, Engineering.

## Browser pane pass (2026-11-05)
Dates page https://www.ucalgary.ca/future-students/undergraduate/admissions/dates LOADED in the browser (scraped): "March 1 - Application deadline: Fall undergraduate admission"; "March 15 - Document deadline: Fall undergraduate admission"; "Aug. 15 International application opens".
Corrected: application row due 2027-04-01 -> 2027-03-01 (label shortened, src -> new key "dates"). Added row: 2027-03-15 documents (other).
Caveat: the page does not print the year and does not say "international" for the 1 March deadline; the Computer Science requirements page (which gave 1 Apr) went to the maintenance site (coldsite-ucalgary.azurewebsites.net) and could not be re-read, so the 1 Apr vs 1 Mar conflict is resolved only in favour of the dates page. Controller may prefer to keep 1 Apr as a later "final" date.
Not used: Prestige Award application 1 Dec / documents 15 Dec (page does not say international students are eligible). No extra steps checked; researched stays false.

## Integration (2026-11-05)
Row 0 corrected in place: 2027-04-01 -> 2027-03-01 (src dates; notes say the page prints no year and the requirements pages said 1 Apr). Row 1 (15 Mar documents) appended. The three courses' application_deadline 2027-04-01 -> 2027-03-01 in data/colleges/calgary.json (live programs: supabase/patches/2026-11-05-calgary-course-deadlines.sql). researched false.
