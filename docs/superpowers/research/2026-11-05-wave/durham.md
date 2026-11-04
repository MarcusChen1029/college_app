<!-- Copied from the Task 11 wave workspace on 2026-11-05. The research agents' own words; the integration notes at
     the end say what went into data/. -->

# durham
Rows added: none. Corrected: none. (cycle copy unchanged)
Steps: send_scanned_qualifications (supplementary_form, all) - tag SUMMARY (search-tool summary of durham.ac.uk pages; durham.ac.uk returns 403 to WebFetch and curl). researched=true on that basis; no date given.
Not found / left out: Inspiring Excellence scholarship rounds (7 Dec 2026, 15 Mar 2027, 1 May 2027) appear only in a search summary and a third-party guide; the official undergraduate page lists 2027 dates as to be confirmed -> NOT used. Offer/deposit deadlines; Durham interviews (only Primary Education/Foundation per summary); Law/Maths tests not in our courses (CS, Economics, Mechanical Eng need none per summary).
Offset source: UK GMT from 25 Oct 2026 from the brief; no clock-time rows added.

## Browser pane pass (2026-11-05)
CONFIRMED (scraped) https://www.durham.ac.uk/study/international/application-guidance/ : "you will also need to send scanned copies of your qualifications (including your score in any English language test...) to our Recruitment and Admissions Office." Step send_scanned_qualifications tag summary -> scraped; step unchanged. Page also: UCAS institution code D86, include UCAS PID, name, date of birth in the email.
Course page https://www.durham.ac.uk/study/courses/computer-science-g400/ : no interview/admissions-test/portfolio text found (entry requirements tab content not exhaustively read). Economics and Mechanical Engineering course pages not checked. No extra steps added.
Still unconfirmed: Inspiring Excellence scholarship dates, offer/deposit dates.

## Integration (2026-11-05)
Taken as proposed (rows appended, steps file as proposed).
