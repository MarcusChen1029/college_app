// Campus photographs on the home page: Wikimedia Commons, openly licensed, shown recoloured (navy duotone).
// Every one is credited on the page with its creator, licence and source page. Files: public/campus/ (credits.json there too).

export type CampusPhoto = {
  src: string;
  width: number;
  height: number;
  /** What the picture shows, for alt text and the credit line. */
  title: string;
  creator: string;
  licence: string;
  licenceUrl: string;
  sourcePage: string;
};

const photo = (file: string, width: number, height: number, title: string, creator: string, licence: string, licenceUrl: string, page: string): CampusPhoto => ({
  src: `/campus/${file}`,
  width,
  height,
  title,
  creator,
  licence,
  licenceUrl,
  sourcePage: `https://commons.wikimedia.org/wiki/File:${page}`,
});

export const CAMPUS = {
  berkeley: photo("berkeley.jpg", 2400, 1549, "Sather Tower, UC Berkeley", "Coolcaesar", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0", "Sather_Tower_from_Memorial_Glade.jpg"),
  mit: photo("mit.jpg", 2400, 1597, "Killian Court, MIT", "Madcoverboy", "CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0", "MIT_Killian_Court.jpg"),
  michigan: photo(
    "michigan.jpg",
    2250,
    1266,
    "Law Quadrangle, University of Michigan",
    "w_lemay",
    "CC BY-SA 2.0",
    "https://creativecommons.org/licenses/by-sa/2.0",
    "Law_Quadrangle,_University_of_Michigan,_University_Avenue_and_State_Street,_Ann_Arbor,_MI_-_54381402138.jpg",
  ),
  purdue: photo("purdue.jpg", 2100, 1280, "Engineering Fountain and Bell Tower, Purdue", "Julian Herzog", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0", "Engineering_Fountain_Purdue_University_2016_03.jpg"),
  uiuc: photo("uiuc.jpg", 2400, 1392, "Foellinger Auditorium, UIUC", "Herbert J. Brant", "CC BY 3.0", "https://creativecommons.org/licenses/by/3.0", "Foellinger-square-TM-Flickr.jpg"),
  arkansas: photo(
    "arkansas.jpg",
    2250,
    1500,
    "Old Main, University of Arkansas",
    "Michael Barera",
    "CC BY-SA 4.0",
    "https://creativecommons.org/licenses/by-sa/4.0",
    "University_of_Arkansas_May_2017_07_(Old_Main).jpg",
  ),
  stanford: photo("stanford.jpg", 2400, 1350, "Main Quad, Stanford", "Frank Schulenburg", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0", "Stanford_University_campus_in_2016.jpg"),
  columbia: photo(
    "columbia.jpg",
    2250,
    1350,
    "Low Library, Columbia",
    "King of Hearts",
    "CC BY-SA 4.0",
    "https://creativecommons.org/licenses/by-sa/4.0",
    "Columbia_University_New_York_November_2016_002.jpg",
  ),
  princeton: photo("princeton.jpg", 1200, 800, "Nassau Hall, Princeton", "Smallbones", "CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/", "Nassau_Hall_Princeton.JPG"),
} as const satisfies Record<string, CampusPhoto>;
