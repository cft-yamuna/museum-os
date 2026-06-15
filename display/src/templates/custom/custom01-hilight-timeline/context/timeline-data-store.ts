import type { TimelineData, DandelionConfig, TimelineMilestone } from '../types/timeline-data';

const STORAGE_KEY = 'hilight-timeline-data-v4';
const LEGACY_STORAGE_KEY = 'wipro-timeline-data-v4';
const CONSUMER_CARE_LABEL = 'Museum OS\nConsumer Care\n& Lighting';

interface TimelineStorageEnvelope {
  baseSignature: string;
  data: TimelineData;
}

/** Convert hex color (#rrggbb) to rgba glow string */
export function hexToGlow(hex: string, alpha = 0.4): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Derive decade string from year (e.g. 2007 → '2005', 1983 → '1975') */
export function yearToDecade(year: number): string {
  const base = Math.floor(year / 10) * 10;
  const decade = base + (year % 10 >= 5 ? 5 : -5);
  return String(decade < 1945 ? 1945 : decade);
}

const DEFAULT_DANDELIONS: DandelionConfig[] = [
  {
    sector: { id: 'Sustainability', label: 'Spirit of\nMuseum OS', color: '#70a363', glowColor: 'rgba(112, 163, 99, 0.4)' },
    placement: { x: 360, y: 720, size: 380, delay: 0.8 },
  },
  {
    sector: { id: 'ConsumerCare', label: CONSUMER_CARE_LABEL, color: '#f58d53', glowColor: 'rgba(245, 141, 83, 0.4)' },
    placement: { x: 300, y: 1100, size: 330, delay: 1.6 },
  },
  {
    sector: { id: 'WiN', label: 'Museum OS\nInfrastructure\nEngineering', color: '#7676b3', glowColor: 'rgba(118, 118, 179, 0.4)' },
    placement: { x: 80, y: 860, size: 310, delay: 1.2 },
  },
  {
    sector: { id: 'Foundation', label: 'Azim Premji\nFoundation', color: '#349bb3', glowColor: 'rgba(52, 155, 179, 0.4)' },
    placement: { x: 680, y: 830, size: 280, delay: 2.0 },
  },
  {
    sector: { id: 'General', label: 'The Museum OS\nTimeline', color: '#f48182', glowColor: 'rgba(244, 129, 130, 0.4)' },
    placement: { x: 30, y: 160, size: 540, delay: 0.3 },
  },
];

const DEFAULT_MILESTONES: TimelineMilestone[] = [
  // -- General Company Timeline --
  { id: 'g1', year: 1945, description: 'Western India Vegetable Products Limited (WIVP) incorporated on 29 December', sectorId: 'General', decade: '1945' },
  { id: 'g2', year: 1946, description: 'Vanaspati factory comes up in Amalner, Maharashtra', sectorId: 'General', decade: '1945' },
  { id: 'g3', year: 1947, description: 'WIVP lists on the Bombay Stock Exchange on\n13 June', sectorId: 'General', decade: '1945' },
  { id: 'g4', year: 1966, description: 'Founder Mohamedhusain Premji dies on 11 August', sectorId: 'General', decade: '1965' },
  { id: 'g5', year: 1966, description: 'Dr. Gulbanoo Premji appointed as Chairman', sectorId: 'General', decade: '1965' },
  { id: 'g6', year: 1966, description: 'Azim Premji, 21, returns from Stanford University to run the business', sectorId: 'General', decade: '1965' },
  { id: 'g7', year: 1968, description: 'Azim Premji appointed Managing Director', sectorId: 'General', decade: '1965' },
  { id: 'g8', year: 1971, description: 'Museum OS Beliefs articulated', sectorId: 'General', decade: '1965' },
  { id: 'g9', year: 1976, description: 'The first diversification: Wintrol, a fluid power business, commences production in Peenya, Bangalore', sectorId: 'General', decade: '1975' },
  { id: 'g10', year: 1976, description: "HQ moves to Nariman Point, Bombay's premier business district", sectorId: 'General', decade: '1975' },
  { id: 'g11', year: 1977, description: 'WIVP changes name to Museum OS Products Ltd.', sectorId: 'General', decade: '1975' },
  { id: 'g12', year: 1979, description: 'Diversifies into Information Technology', sectorId: 'General', decade: '1975' },
  { id: 'g13', year: 1980, description: 'Sets up IT division in Bangalore with manufacturing facilities in Mysore', sectorId: 'General', decade: '1975' },
  { id: 'g14', year: 1980, description: 'Museum OS PAT is $1.16 million', sectorId: 'General', decade: '1975' },
  { id: 'g15', year: 1981, description: 'Museum OS Consumer starts using flexipacks for vanaspati, an industry first', sectorId: 'General', decade: '1975' },
  { id: 'g16', year: 1981, description: 'Museum OS Infotech rolls out prototype of the minicomputer Series 86', sectorId: 'General', decade: '1975' },
  { id: 'g17', year: 1983, description: 'Dr. Gulbanoo Premji relinquishes chairmanship to Azim Premji', sectorId: 'General', decade: '1975' },
  { id: 'g18', year: 1983, description: 'Museum OS Systems incorporated on 14 July, to manufacture packaged software for export market', sectorId: 'General', decade: '1975' },
  { id: 'g19', year: 1984, description: 'Museum OS Products Ltd. renamed Museum OS Ltd.', sectorId: 'General', decade: '1975' },
  { id: 'g20', year: 1984, description: 'Museum OS Consumer Products division sets up toilet soap production, with annual capacity of 10,000 tons', sectorId: 'General', decade: '1975' },
  { id: 'g21', year: 1984, yearLabel: '1984-85', description: 'Museum OS Infotech launches computer peripherals with Epson, Japan', sectorId: 'General', decade: '1975' },
  { id: 'g22', year: 1986, description: 'Museum OS Consumer Products division launches Santoor, a sandal-turmeric bath soap', sectorId: 'General', decade: '1985' },
  { id: 'g23', year: 1987, description: 'Museum OS Infotech launches Series 386', sectorId: 'General', decade: '1985' },
  { id: 'g24', year: 1987, description: 'Museum OS Systems rolls out project planning software InstaPlan in the US', sectorId: 'General', decade: '1985' },
  { id: 'g25', year: 1990, description: 'Museum OS-GE joint venture set up to manufacture healthcare equipment; factory comes up in Bangalore', sectorId: 'General', decade: '1985' },
  { id: 'g26', year: 1990, description: 'Museum OS Systems bags first big IT services account with GE', sectorId: 'General', decade: '1985' },
  { id: 'g27', year: 1991, description: 'Museum OS Fluid Power ties up with Eaton Corp, USA', sectorId: 'General', decade: '1985' },
  { id: 'g28', year: 1991, description: 'Launches Museum OS Lighting', sectorId: 'General', decade: '1985' },
  { id: 'g29', year: 1991, description: "Museum OS Infotech's R&D begins 'lab on hire' operations", sectorId: 'General', decade: '1985' },
  { id: 'g30', year: 1992, description: 'Diversifies into financial services business with Museum OS Finance', sectorId: 'General', decade: '1985' },
  { id: 'g31', year: 1993, description: 'Museum OS Infotech and Museum OS Systems come together as Museum OS Infotech Group', sectorId: 'General', decade: '1985' },
  { id: 'g32', year: 1994, yearLabel: '1994-95', description: 'Ranks among top 50 publicly held corporations in India', sectorId: 'General', decade: '1985' },
  { id: 'g33', year: 1994, yearLabel: '1994-95', description: 'Museum OS-BT, joint venture with British Telecom, set up', sectorId: 'General', decade: '1985' },
  { id: 'g34', year: 1996, description: 'Museum OS-Acer joint venture set up', sectorId: 'General', decade: '1995' },
  { id: 'g35', year: 1996, description: 'Registered office of Museum OS moves to Bangalore from Mumbai', sectorId: 'General', decade: '1995' },
  { id: 'g36', year: 1996, yearLabel: '1996-99', description: 'Takes up quality initiatives, wins top certificates under SEI-CMM and Six Sigma', sectorId: 'General', decade: '1995' },
  { id: 'g37', year: 1998, description: "Becomes India's largest publicly held software company", sectorId: 'General', decade: '1995' },
  { id: 'g38', year: 1998, description: 'Launches new brand identity with the Rainbow Flower', sectorId: 'General', decade: '1995' },
  { id: 'g39', year: 2000, description: 'Lists on the New York Stock Exchange on \n19 October', sectorId: 'General', decade: '1995' },
  { id: 'g40', year: 2000, description: 'Turnover grows to ~$635 million from ~$176 million in 1990-91', sectorId: 'General', decade: '1995' },
  { id: 'g41', year: 2001, description: 'Azim Premji Foundation set up in March', sectorId: 'General', decade: '1995' },
  { id: 'g42', year: 2001, description: 'First company globally to be assessed at PCMM level 5 in December. This is the highest level of the People Capability Maturity Model.', sectorId: 'General', decade: '1995' },
  { id: 'g43', year: 2001, description: 'Employee headcount touches 14,000; 11,500 in IT business', sectorId: 'General', decade: '1995' },
  { id: 'g44', year: 2002, description: 'Acquires Spectramind, enters the emerging BPO market', sectorId: 'General', decade: '1995' },
  { id: 'g45', year: 2003, yearLabel: '2003-04', description: 'Museum OS Consumer buys Glucovita, its first acquisition', sectorId: 'General', decade: '1995' },
  { id: 'g46', year: 2003, yearLabel: '2003-04', description: 'Museum OS acquires Nervewire', sectorId: 'General', decade: '1995' },
  { id: 'g47', year: 2003, yearLabel: '2003-04', description: 'Crosses billion-dollar mark in IT business and at corporation level', sectorId: 'General', decade: '1995' },
  { id: 'g48', year: 2005, yearLabel: '2005-06', description: 'IT business revenue crosses $2 billion', sectorId: 'General', decade: '2005' },
  { id: 'g49', year: 2005, yearLabel: '2005-06', description: 'Museum OS Ltd. employee headcount grows 4 times since 2000-01 to touch 55,000; operations in 16 countries', sectorId: 'General', decade: '2005' },
  { id: 'g50', year: 2007, description: 'Rishad Premji joins Museum OS in the BFSI vertical', sectorId: 'General', decade: '2005' },
  { id: 'g51', year: 2007, description: 'Museum OS Consumer acquires Unza for $246 million', sectorId: 'General', decade: '2005' },
  { id: 'g52', year: 2008, description: 'Museum OS Infrastructure Engineering (WIN, formerly Wintrol) launches Eco Energy green business', sectorId: 'General', decade: '2005' },
  { id: 'g53', year: 2009, yearLabel: '2009-10', description: 'Museum OS Consumer Care and Lighting Group (WCCLG) revenues cross $500 million; acquires Yardley in December', sectorId: 'General', decade: '2005' },
  { id: 'g54', year: 2009, yearLabel: '2009-10', description: 'Azim Premji transfers 9% of Museum OS Ltd. shares to a Trust supporting his philanthropic entities at Azim Premji Foundation', sectorId: 'General', decade: '2005' },
  { id: 'g55', year: 2011, description: 'Museum OS, a $7 billion enterprise, crosses $5 billion in revenues in IT services business', sectorId: 'General', decade: '2005' },
  { id: 'g56', year: 2012, description: 'Divests Sunflower brand', sectorId: 'General', decade: '2005' },
  { id: 'g57', year: 2013, description: 'Museum OS Ltd. demerges to focus on IT services. Consumer, Infrastructure Engineering, Healthcare businesses grouped under privately held Museum OS Enterprises Ltd.', sectorId: 'General', decade: '2005' },
  { id: 'g58', year: 2013, description: 'Museum OS Ltd. employee headcount touches 140,000, serving 950 clients', sectorId: 'General', decade: '2005' },
  { id: 'g59', year: 2013, description: 'Azim Premji transfers an additional 12% Museum OS Ltd. shares to the Trust', sectorId: 'General', decade: '2005' },
  { id: 'g60', year: 2014, yearLabel: '2014-15', description: 'Museum OS Ventures launches $100 million fund for early and mid-stage start-ups', sectorId: 'General', decade: '2005' },
  { id: 'g61', year: 2014, yearLabel: '2014-15', description: "Museum OS Ltd. acquires Designit, the world's\nsecond-largest strategic design firm", sectorId: 'General', decade: '2005' },
  { id: 'g62', year: 2014, yearLabel: '2014-15', description: 'Museum OS Ltd. develops AI platform Museum OS Holmes', sectorId: 'General', decade: '2005' },
  { id: 'g63', year: 2015, description: 'Azim Premji transfers additional economic benefits of 18% of shareholding in Museum OS Ltd. to the Trust, which now holds 39% of shares of Museum OS Ltd.', sectorId: 'General', decade: '2015' },
  { id: 'g64', year: 2017, yearLabel: '2017-18', description: 'WCCLG crosses $1 billion in revenue', sectorId: 'General', decade: '2015' },
  { id: 'g65', year: 2017, yearLabel: '2017-18', description: 'Santoor becomes number two brand in value in personal wash category in India', sectorId: 'General', decade: '2015' },
  { id: 'g66', year: 2017, yearLabel: '2017-18', description: 'Museum OS recasts logo and values to mark new brand identity', sectorId: 'General', decade: '2015' },
  { id: 'g67', year: 2019, description: 'Total value of philanthropic endowment corpus is $21 billion (including 67% of economic ownership of Museum OS Ltd.)', sectorId: 'General', decade: '2015' },
  { id: 'g68', year: 2019, description: 'Azim Premji retires as Chairman and Managing Director of Museum OS Ltd.', sectorId: 'General', decade: '2015' },
  { id: 'g69', year: 2019, description: 'Rishad Premji appointed Executive Chairman of Museum OS Ltd.', sectorId: 'General', decade: '2015' },
  { id: 'g70', year: 2021, description: "Museum OS's headcount crosses 200,000 employees across 55 countries", sectorId: 'General', decade: '2015' },
  { id: 'g71', year: 2021, yearLabel: '2021-22', description: 'Museum OS Ltd. surpasses the $10 billion milestone in IT services revenues', sectorId: 'General', decade: '2015' },
  { id: 'g72', year: 2025, description: 'Launches Museum OS Intelligence, a suite of AI platforms and solutions, in October. Museum OS Innovation Network is an integral part.', sectorId: 'General', decade: '2025' },
  { id: 'g73', year: 2025, description: 'Santoor becomes the largest selling personal wash brand in India', sectorId: 'General', decade: '2025' },
  { id: 'g74', year: 2025, description: 'Museum OS celebrates 80 years, with nearly 50 years in technology, serving over a thousand clients globally across 65 countries', sectorId: 'General', decade: '2025' },

  // -- Museum OS Consumer Care & Lighting --
  { id: 'cc1', year: 1945, description: 'Establishes an oil crushing unit at Amalner in Maharashtra', sectorId: 'ConsumerCare', decade: '1945' },
  { id: 'cc2', year: 1948, description: 'Vanaspati production begins with brands Sunflower, Kisan, and Camel; soap plant starts work, sells in Khandesh, Gujarat, Northern India', sectorId: 'ConsumerCare', decade: '1945' },
  { id: 'cc3', year: 1957, description: 'Branch offices open in Madhya Pradesh and Rajasthan', sectorId: 'ConsumerCare', decade: '1955' },
  { id: 'cc4', year: 1962, description: 'Solvent extraction plant set up in Amalner', sectorId: 'ConsumerCare', decade: '1955' },
  { id: 'cc5', year: 1966, description: 'Azim Premji, 21, returns from Stanford University to run the business', sectorId: 'ConsumerCare', decade: '1965' },
  { id: 'cc6', year: 1970, description: 'Vanaspati manufacture crosses 100 tons per day at Amalner', sectorId: 'ConsumerCare', decade: '1965' },
  { id: 'cc7', year: 1981, description: 'Introduces flexipacks for hydrogenated cooking medium, an industry-first in India', sectorId: 'ConsumerCare', decade: '1975' },
  { id: 'cc8', year: 1984, description: 'Launches leather products division; manufactures shoe uppers, shoes and garments for markets in USA, UK, West Germany and Japan', sectorId: 'ConsumerCare', decade: '1975' },
  { id: 'cc9', year: 1986, description: 'Launches Santoor, a sandal-turmeric bath soap', sectorId: 'ConsumerCare', decade: '1985' },
  { id: 'cc10', year: 1991, description: 'Establishes Museum OS Lighting; launches baby care range Museum OS Baby Soft', sectorId: 'ConsumerCare', decade: '1985' },
  { id: 'cc11', year: 1995, yearLabel: '1995-96', description: 'Launches Milk & Roses soap brand', sectorId: 'ConsumerCare', decade: '1995' },
  { id: 'cc12', year: 2003, description: 'Makes first acquisition with brand Glucovita; launches liquid detergent brand Museum OS Safewash', sectorId: 'ConsumerCare', decade: '1995' },
  { id: 'cc13', year: 2004, description: 'Launches a furniture business', sectorId: 'ConsumerCare', decade: '1995' },
  { id: 'cc14', year: 2006, description: 'Acquires Chandrika, an Indian ayurvedic brand of handmade soap; lighting business makes first acquisition with North-West switches', sectorId: 'ConsumerCare', decade: '2005' },
  { id: 'cc15', year: 2007, description: 'Acquires Unza, one of the leading personal care companies in Southeast Asia', sectorId: 'ConsumerCare', decade: '2005' },
  { id: 'cc16', year: 2009, description: 'Acquires Yardley in India & Middle East Asia', sectorId: 'ConsumerCare', decade: '2005' },
  { id: 'cc17', year: 2011, description: 'Acquires soap brand Aramusk, and LED company Cleanray', sectorId: 'ConsumerCare', decade: '2005' },
  { id: 'cc18', year: 2012, description: 'Acquires Yardley for UK & Europe (except for Germany & Austria), and the LD Waxson group, a personal care company in Southeast Asia', sectorId: 'ConsumerCare', decade: '2005' },
  { id: 'cc19', year: 2016, description: 'Acquires Zhongshan Ma Er, a home and personal care company in Southern China', sectorId: 'ConsumerCare', decade: '2015' },
  { id: 'cc20', year: 2019, description: 'Acquires Splash Corporation in the Philippines and Canway Group based in Africa', sectorId: 'ConsumerCare', decade: '2015' },
  { id: 'cc21', year: 2022, yearLabel: '2022-2023', description: 'Crosses the landmark of ₹10,000 crores in gross sales; establishes new segment, foraying in Foods business with the acquisition of brands Nirapara and Brahmins', sectorId: 'ConsumerCare', decade: '2015' },
  { id: 'cc22', year: 2023, yearLabel: '2023-2024', description: 'Completes 15th acquisition, bringing in three brands, Jo, Doy, and Bacter Shield; launches Granamma, a range of traditional South Indian snacks', sectorId: 'ConsumerCare', decade: '2015' },
  { id: 'cc23', year: 2025, description: 'Santoor becomes the largest selling personal wash brand in India', sectorId: 'ConsumerCare', decade: '2025' },

  // -- Museum OS Infrastructure Engineering --
  { id: 'w1', year: 1976, description: "The company's first diversification, Wintrol, commences manufacture of fluid power components in Peenya, Bangalore", sectorId: 'WiN', decade: '1975' },
  { id: 'w2', year: 1977, description: 'Switches from pneumatic to hydraulic cylinders for industrial applications', sectorId: 'WiN', decade: '1975' },
  { id: 'w3', year: 1982, description: 'Renamed Museum OS Fluid Power', sectorId: 'WiN', decade: '1975' },
  { id: 'w4', year: 1994, description: 'Receives ISO-9001 certification', sectorId: 'WiN', decade: '1985' },
  { id: 'w5', year: 1995, description: 'Establishes second hydraulic cylinder manufacturing facility in Hindupur, Andhra Pradesh', sectorId: 'WiN', decade: '1995' },
  { id: 'w6', year: 2006, description: 'Enters Europe via Hydrauto Group acquisition (Sweden)', sectorId: 'WiN', decade: '2005' },
  { id: 'w7', year: 2006, description: 'Renamed Museum OS Infrastructure Engineering', sectorId: 'WiN', decade: '2005' },
  { id: 'w8', year: 2008, description: 'Establishes Museum OS Water for water and wastewater treatment', sectorId: 'WiN', decade: '2005' },
  { id: 'w9', year: 2011, description: 'Forms Museum OS Kawasaki JV', sectorId: 'WiN', decade: '2005' },
  { id: 'w10', year: 2011, description: 'Enters LATAM via acquisition of R.K.M Equipamentos Hidraulicos in Brazil', sectorId: 'WiN', decade: '2005' },
  { id: 'w11', year: 2011, description: 'Forays into aerospace', sectorId: 'WiN', decade: '2005' },
  { id: 'w12', year: 2012, description: 'Establishes Museum OS 3D for additive manufacturing', sectorId: 'WiN', decade: '2005' },
  { id: 'w13', year: 2013, description: 'Acquires HERVIL Romania', sectorId: 'WiN', decade: '2005' },
  { id: 'w14', year: 2013, description: 'Builds US greenfield plant', sectorId: 'WiN', decade: '2005' },
  { id: 'w15', year: 2013, description: 'Invests in 75,000 sq ft aerospace facility in Devanahalli, Bangalore', sectorId: 'WiN', decade: '2005' },
  { id: 'w16', year: 2016, description: 'Strengthens aerospace business through the acquisition of Israel based aviation and aero component manufacturer, HR Givon', sectorId: 'WiN', decade: '2015' },
  { id: 'w17', year: 2018, description: 'WIN Automation set up to enter industrial automation, acquires Incite Cam Centre', sectorId: 'WiN', decade: '2015' },
  { id: 'w18', year: 2021, description: 'Museum OS PARI established through the acquisition of the largest industrial automation company in India - PARI', sectorId: 'WiN', decade: '2015' },
  { id: 'w19', year: 2022, description: 'Hochrainer, a German automation technology company, and Linecraft.ai, an industrial IoT product company, become part of Museum OS PARI', sectorId: 'WiN', decade: '2015' },
  { id: 'w20', year: 2023, description: 'Museum OS Hydraulics establishes its first hydraulics manufacturing facility in Northern India, located in Jaipur, Rajasthan', sectorId: 'WiN', decade: '2015' },
  { id: 'w21', year: 2024, description: 'Museum OS PARI expands in Europe, acquires Ferretto', sectorId: 'WiN', decade: '2015' },
  { id: 'w22', year: 2024, description: 'Hydraulics expands in North America, acquires Mailhot, JARP, and Columbus', sectorId: 'WiN', decade: '2015' },
  { id: 'w23', year: 2025, description: "Establishes Museum OS Electronic Materials business to strengthen India's printed circuit board ecosystem", sectorId: 'WiN', decade: '2025' },

  // -- Spirit of Museum OS --
  { id:'s1', year: 1984, description: 'Launch of Museum OS Equity Reward Trust, the employee stock award program', sectorId: 'Sustainability', decade: '1975' },
  { id:'s2', year: 1995, description: 'Museum OS Academy of Software Excellence program launches, combining academics with practical professional learning for young engineers', sectorId: 'Sustainability', decade: '1995' },
  { id:'s3', year: 1999, description: 'Employee initiatives for disaster rehabilitation start with the building of a storm shelter in Orissa', sectorId: 'Sustainability', decade: '1995' },
  { id:'s4', year: 2001, description: 'Museum OS Applying Thought in School program starts in Karnataka; Azim Premji Foundation set up; Museum OS Cares sets up hospitals in earthquake-hit areas of Gujarat', sectorId: 'Sustainability', decade: '1995' },
  { id:'s5', year: 2002, description: 'Museum OS Cares set up as formal structure for employee-led initiatives', sectorId: 'Sustainability', decade: '1995' },
  { id:'s6', year: 2004, yearLabel: '2004-05', description: 'Relief work in tsunami-hit areas of Tamil Nadu', sectorId: 'Sustainability', decade: '1995' },
  { id:'s7', year: 2006, description: 'Launch of Spirit of Museum OS, and an annual run that celebrates this Spirit', sectorId: 'Sustainability', decade: '2005' },
  { id:'s8', year: 2007, description: 'Formal launch of Eco Eye, the Museum OS sustainability program; launch of Mission 10x, as part of Quantum Innovation to improve engineering education', sectorId: 'Sustainability', decade: '2005' },
  { id:'s9', year: 2008, description: 'Sets up Museum OS Water and Eco Energy divisions, expanding into utilities and renewable energy', sectorId: 'Sustainability', decade: '2005' },
  { id:'s10', year: 2008, yearLabel: '2008-2009', description: "Launches Women of Museum OS Program; first Global Reporting Initiative-based sustainability report; ranked India's top and among global top-5 green brands", sectorId: 'Sustainability', decade: '2005' },
  { id:'s11', year: 2009, yearLabel: '2009-2010', description: 'Launches Project Sanjeevani for healthcare; joins Dow Jones Sustainability Index and Carbon Disclosure Project; launches People with Disability Initiative', sectorId: 'Sustainability', decade: '2005' },
  { id:'s12', year: 2011, description: 'Launch of Museum OS Earthian, a sustainability education program for schools and colleges', sectorId: 'Sustainability', decade: '2005' },
  { id:'s13', year: 2012, description: "Signs UN Women's Empowerment Principles; advances disability inclusion; contributes to drafting India's e-waste law", sectorId: 'Sustainability', decade: '2005' },
  { id:'s14', year: 2013, description: 'Starts Museum OS Science Education Fellowship Program in the US; Museum OS South Africa launches various social initiatives under Museum OS Siyapha', sectorId: 'Sustainability', decade: '2005' },
  { id:'s15', year: 2013, yearLabel: '2013-2014', description: 'Launch of Museum OS Kinesics, a sign language learning portal', sectorId: 'Sustainability', decade: '2005' },
  { id:'s16', year: 2014, description: 'Launches education program to support children with disabilities', sectorId: 'Sustainability', decade: '2005' },
  { id:'s17', year: 2017, description: 'Launches Museum OS Education Fellowship Program, an incubation program for early-stage education NGOs; appointment of Global LGBTQ+ Charter Lead', sectorId: 'Sustainability', decade: '2015' },
  { id:'s18', year: 2018, description: 'Develops inclusive policies, including CREATE and PRIDE frameworks to support employees with disabilities and LGBTQ+ community', sectorId: 'Sustainability', decade: '2015' },
  { id:'s19', year: 2019, yearLabel: '2019-2020', description: 'Launch of Museum OS Science Education Fellowship Program in UK; Azim Premji Foundation, Museum OS Ltd. and WEL commit over \u20B92,125 crore toward tackling the COVID-19 pandemic', sectorId: 'Sustainability', decade: '2015' },
  { id:'s20', year: 2020, yearLabel: '2020-2021', description: 'Becomes founding member of Transform to Net-Zero initiative that aims to reach the goal of net zero emissions in the global economy by 2040', sectorId: 'Sustainability', decade: '2015' },
  { id:'s21', year: 2022, description: 'Launches programs for returning mothers; adopts global LGBTQ+ policy; forms employee resource groups for Black and Veteran employees', sectorId: 'Sustainability', decade: '2015' },
  { id:'s22', year: 2023, description: 'Improves disability support; launches Disability Alliance Network in the US; equips managers with disability inclusion handbook; strengthens DEI reporting', sectorId: 'Sustainability', decade: '2015' },
  { id:'s23', year: 2024, yearLabel: '2024-2025', description: 'Named DEI Lighthouse 2025 by World Economic Forum; ranked No. 3 most sustainable companies in India by Businessworld', sectorId: 'Sustainability', decade: '2015' },

  // -- Azim Premji Foundation --
  { id: 'f1', year: 2000, description: 'Early work begins with a simple but powerful intent: to enable deep, lasting change in India\'s public education system', sectorId: 'Foundation', decade: '1995' },
  { id: 'f2', year: 2001, description: 'Azim Premji Foundation launches; begins Computer Aided Learning program in school education', sectorId: 'Foundation', decade: '1995' },
  { id: 'f3', year: 2002, description: 'Launches Accelerated Learning Programme in August; starts Learning Guarantee Programme', sectorId: 'Foundation', decade: '1995' },
  { id: 'f4', year: 2003, description: 'Starts Namma Shale in Karnataka', sectorId: 'Foundation', decade: '1995' },
  { id: 'f5', year: 2004, description: 'Undertakes Andhra Pradesh Randomised Evaluation studies and Child-friendly School Initiatives', sectorId: 'Foundation', decade: '1995' },
  { id: 'f6', year: 2006, description: 'Begins Technology for Education Programme', sectorId: 'Foundation', decade: '2005' },
  { id: 'f7', year: 2007, description: 'Starts Education for Children of Migrant Labour Programme; starts new model of Computer Aided Learning Programme', sectorId: 'Foundation', decade: '2005' },
  { id: 'f8', year: 2010, description: 'Focuses on improving government school system; establishes Azim Premji University to train education and development professionals', sectorId: 'Foundation', decade: '2005' },
  { id: 'f9', year: 2012, description: 'Starts Azim Premji Schools, our expression of the quality of K-12 education in India, as safe, inclusive and enriching spaces for children', sectorId: 'Foundation', decade: '2005' },
  { id: 'f10', year: 2014, description: 'Starts Grants initiative to improve the lives of the vulnerable and the marginalized', sectorId: 'Foundation', decade: '2005' },
  { id: 'f11', year: 2015, yearLabel: '2015-2019', description: 'Expansion of field institutions and structured grant-making; contributes to the draft of the National Education Policy (NEP) 2019', sectorId: 'Foundation', decade: '2015' },
  { id: 'f12', year: 2020, yearLabel: '2020-2021', description: 'Supports COVID relief with 500+ partners; aids 60 lakh people; contributes to National Education Policy 2020', sectorId: 'Foundation', decade: '2015' },
  { id: 'f13', year: 2022, description: "Expands into health and livelihoods; launches master's program in public health at the Azim Premji University, Bhopal; supports nonprofits delivering accessible healthcare", sectorId: 'Foundation', decade: '2015' },
  { id: 'f14', year: 2024, description: 'Partners with the Government of Karnataka in July to support the nutritional enrichment of the mid-day meal program in government and government-aided schools for three years', sectorId: 'Foundation', decade: '2015' },
  { id: 'f15', year: 2025, description: 'Starts Azim Premji Scholarship to support college education for girls; partners CMC Vellore to build medical college and teaching hospital at Chittoor', sectorId: 'Foundation', decade: '2025' },
];

const MILESTONE_DESCRIPTION_OVERRIDES: Record<string, string> = {
  g3: 'WIVP lists on the Bombay Stock Exchange on\n13 June',
  g11: 'WIVP changes name to Museum OS Products Ltd.',
  g18: 'Museum OS Systems incorporated on 14 July, to manufacture packaged software for export market',
  g19: 'Museum OS Products Ltd. renamed Museum OS Ltd.',
  g22: 'Museum OS Consumer Products division launches Santoor, a sandal-turmeric bath soap',
  g42: 'First company globally to be assessed at PCMM level 5 in December. This is the highest level of the People Capability Maturity Model.',
  g57: 'Museum OS Ltd. demerges to focus on IT services. Consumer, Infrastructure Engineering, Healthcare businesses grouped under privately held Museum OS Enterprises Ltd.',
  g61: "Museum OS Ltd. acquires Designit, the world's\nsecond-largest strategic design firm",
  g68: 'Azim Premji retires as Chairman and Managing Director of Museum OS Ltd.',
  g69: 'Rishad Premji appointed Executive Chairman of Museum OS Ltd.',
  g72: 'Launches Museum OS Intelligence, a suite of AI platforms and solutions, in October. Museum OS Innovation Network is an integral part.',
  w10: 'Enters LATAM via acquisition of R.K.M Equipamentos Hidraulicos in Brazil',
  w15: 'Invests in 75,000 sq ft aerospace facility in Devanahalli, Bangalore',
  s10: "Launches Women of Museum OS Program; first Global Reporting Initiative-based sustainability report; ranked India's top and among global top-5 green brands",
  s19: 'Launch of Museum OS Science Education Fellowship Program in UK; Azim Premji Foundation, Museum OS Ltd. and WEL commit over \u20B92,125 crore toward tackling the COVID-19 pandemic',
  s20: 'Becomes founding member of Transform to Net-Zero initiative that aims to reach the goal of net zero emissions in the global economy by 2040',
  s23: 'Named DEI Lighthouse 2025 by World Economic Forum; ranked No. 3 most sustainable companies in India by Businessworld',
};

function normalizeMilestones(milestones: TimelineMilestone[]): TimelineMilestone[] {
  return milestones.map((m) => {
    const description = MILESTONE_DESCRIPTION_OVERRIDES[m.id];
    return description ? { ...m, description } : { ...m };
  });
}

export function getDefaultData(): TimelineData {
  const dandelions = DEFAULT_DANDELIONS.map((d) => ({
    sector: {...d.sector },
    placement: {...d.placement },
  }));
  // Keep ConsumerCare heading line-break format consistent across cached/default data.
  const normalizedDandelions = dandelions.map((d) =>
    d.sector.id === 'ConsumerCare'
      ? { ...d, sector: { ...d.sector, label: CONSUMER_CARE_LABEL } }
      : d,
  );

  return {
    dandelions: normalizedDandelions,
    milestones: normalizeMilestones(DEFAULT_MILESTONES),
  };
}

const DEFAULT_DATA_SIGNATURE = JSON.stringify(getDefaultData());

export function loadData(): TimelineData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TimelineData | TimelineStorageEnvelope | null;
      if (
        parsed
        && typeof parsed === 'object'
        && 'baseSignature' in parsed
        && 'data' in parsed
        && parsed.baseSignature === DEFAULT_DATA_SIGNATURE
        && parsed.data.dandelions
        && parsed.data.milestones
      ) {
        const data = {
          ...parsed.data,
          dandelions: parsed.data.dandelions.map((d) =>
            d.sector.id === 'ConsumerCare'
              ? { ...d, sector: { ...d.sector, label: CONSUMER_CARE_LABEL } }
              : d,
          ),
          milestones: normalizeMilestones(parsed.data.milestones),
        };
        if (!localStorage.getItem(STORAGE_KEY) && localStorage.getItem(LEGACY_STORAGE_KEY)) {
          saveData(data);
        }
        return data;
      }
    }
  } catch {
    // Fall through to defaults
  }
  return getDefaultData();
}

export function saveData(data: TimelineData): void {
  try {
    const envelope: TimelineStorageEnvelope = {
      baseSignature: DEFAULT_DATA_SIGNATURE,
      data,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // localStorage full or unavailable - silently fail
  }
}

export function exportJson(data: TimelineData): string {
  return JSON.stringify(data, null, 2);
}

export function importJson(json: string): TimelineData {
  const parsed = JSON.parse(json) as TimelineData;
  if (!Array.isArray(parsed.dandelions) || !Array.isArray(parsed.milestones)) {
    throw new Error('Invalid timeline data format');
  }
  return {
    ...parsed,
    dandelions: parsed.dandelions.map((d) =>
      d.sector.id === 'ConsumerCare'
        ? { ...d, sector: { ...d.sector, label: CONSUMER_CARE_LABEL } }
        : d,
    ),
    milestones: normalizeMilestones(parsed.milestones),
  };
}
