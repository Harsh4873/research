/**
 * The reading list behind the diabetes positive-selection work: every reference
 * cited by the manuscript and by its supplementary material, as DOIs.
 *
 * Only the identifiers are kept. Titles, authors and abstracts are fetched from
 * Europe PMC when the list is imported, so nothing here copies a publisher's
 * text, and the manuscript itself is not part of this repository.
 */

export type BibliographySource = 'main' | 'supplementary' | 'both';

export interface BibliographyEntry {
  doi: string;
  /** First author and year, so the list reads before anything is fetched. */
  label: string;
  source: BibliographySource;
}

export const BIBLIOGRAPHY: BibliographyEntry[] = [
  { doi: '10.1086/519841', label: 'Alisjahbana 2007', source: 'main' },
  { doi: '10.1186/1741-7015-9-81', label: 'Baker 2011', source: 'main' },
  { doi: '10.1093/cid/cir939', label: 'Baker 2012', source: 'main' },
  { doi: '10.1378/chest.120.5.1514', label: 'Bashar 2001', source: 'main' },
  { doi: '10.1002/cpbi.2', label: 'Bielawski 2016', source: 'supplementary' },
  { doi: '10.1126/sciadv.aaw3307', label: 'Chiner-Oms 2019', source: 'main' },
  { doi: '10.1038/s41588-017-0029-0', label: 'Coll 2018', source: 'main' },
  { doi: '10.1016/j.cell.2025.09.007', label: 'Culviner 2025', source: 'main' },
  { doi: '10.1093/cid/cix819', label: 'Degner 2018', source: 'main' },
  { doi: '10.1016/S1473-3099(09)70282-8', label: 'Dooley 2009', source: 'main' },
  { doi: '10.1111/tmi.12120', label: 'Faurholt-Jepsen 2013', source: 'main' },
  { doi: '10.1080/00365540802342372', label: 'Fisher-Hoch 2008', source: 'main' },
  { doi: '10.1002/14651858.CD016013.pub2', label: 'Franco 2024', source: 'main' },
  { doi: '10.1038/nrmicro.2018.8', label: 'Gagneux 2018', source: 'main' },
  { doi: '10.1111/j.1096-0031.2008.00217.x', label: 'Goloboff 2008', source: 'main' },
  { doi: '10.1038/s41564-018-0218-3', label: 'Hicks 2018', source: 'main' },
  { doi: '10.1038/s41588-018-0117-9', label: 'Holt 2018', source: 'main' },
  { doi: '10.5588/ijtld.11.0670', label: 'Hsu 2013', source: 'main' },
  { doi: '10.1016/j.tube.2025.102690', label: 'Ioerger 2025', source: 'main' },
  { doi: '10.1371/journal.pmed.0050152', label: 'Jeon 2008', source: 'main' },
  { doi: '10.1136/thoraxjnl-2012-201756', label: 'Jiménez-Corona 2013', source: 'main' },
  { doi: '10.1093/molbev/msi105', label: 'Kosakovsky Pond 2005', source: 'supplementary' },
  { doi: '10.1093/infdis/jit241', label: 'Kumar 2013', source: 'main' },
  { doi: '10.7554/eLife.46477', label: 'Kumar 2019', source: 'main' },
  { doi: '10.1371/journal.pone.0092623', label: 'Lee 2014', source: 'main' },
  { doi: '10.1371/journal.ppat.1005675', label: 'Lin 2016', source: 'main' },
  { doi: '10.1007/s10753-013-9808-7', label: 'Liu 2014', source: 'main' },
  { doi: '10.1038/s41598-017-01213-5', label: 'Liu 2017', source: 'main' },
  { doi: '10.1126/science.abq2787', label: 'Liu 2022', source: 'main' },
  { doi: '10.1073/pnas.1617644113', label: 'Lupoli 2016', source: 'main' },
  { doi: '10.1016/j.ijid.2012.12.029', label: 'Magee 2013', source: 'main' },
  { doi: '10.5588/ijtld.14.0811', label: 'Magee 2015', source: 'main' },
  { doi: '10.1093/bioinformatics/btac023', label: 'Marin 2022', source: 'main' },
  { doi: '10.1093/cid/ciab1067', label: 'Mave 2022', source: 'main' },
  { doi: '10.1371/journal.pone.0292965', label: 'Mejía-Ponce 2023', source: 'main' },
  { doi: '10.1099/mgen.0.000465', label: 'Modlin 2021', source: 'main' },
  { doi: '10.3390/biomedicines11092568', label: 'Navasardyan 2023', source: 'main' },
  { doi: '10.1016/S0140-6736(24)02317-1', label: 'NCD Risk Factor Collaboration. (2024). Worldwide trends in diabetes prevalence and treatment from 1990 to 2022: a pooled analysis of 1108 population-representative studies with 141 million participants. Lancet 2024', source: 'main' },
  { doi: '10.1093/oxfordjournals.molbev.a040410', label: 'Nei 1986', source: 'both' },
  { doi: '10.1093/genetics/148.3.929', label: 'Nielsen 1998', source: 'main' },
  { doi: '10.1099/mic.0.001625', label: 'O\'Malley 2025', source: 'main' },
  { doi: '10.1186/s12864-016-2467-y', label: 'Phelan 2016', source: 'main' },
  { doi: '10.1186/s13073-019-0650-x', label: 'Phelan 2019', source: 'main' },
  { doi: '10.2337/diacare.27.7.1584', label: 'Ponce-de-León 2004', source: 'main' },
  { doi: '10.1128/JB.182.17.4889-4898.2000', label: 'Primm 2000', source: 'main' },
  { doi: '10.1371/journal.pone.0092977', label: 'Restrepo 2014', source: 'main' },
  { doi: '10.1128/microbiolspec.TNMI7-0023-2016', label: 'Restrepo 2016', source: 'main' },
  { doi: '10.1006/mpat.2000.0407', label: 'Rivera-Marrero 2001', source: 'main' },
  { doi: '10.4049/jimmunol.1500710', label: 'Sande 2016', source: 'main' },
  { doi: '10.1128/JB.185.22.6736-6740.2003', label: 'Sareen 2003', source: 'main' },
  { doi: '10.1073/pnas.0900589106', label: 'Siegrist 2009', source: 'main' },
  { doi: '10.1126/scitranslmed.3009885', label: 'Singhal 2014', source: 'main' },
  { doi: '10.1177/004947550303300311', label: 'Subhash 2003', source: 'main' },
  { doi: '10.1093/cid/ciz284', label: 'Ugarte-Gil 2020', source: 'main' },
  { doi: '10.4049/jimmunol.1000304', label: 'Vallerskog 2010', source: 'main' },
  { doi: '10.3390/tropicalmed6010008', label: 'van Crevel 2021', source: 'main' },
  { doi: '10.1016/j.jdiacomp.2013.12.003', label: 'Viswanathan 2014', source: 'main' },
  { doi: '10.3389/fmicb.2011.00105', label: 'Voskuil 2011', source: 'main' },
  { doi: '10.1371/journal.pone.0112963', label: 'Walker 2014', source: 'main' },
  { doi: '10.1093/molbev/msaa069', label: 'Wilson 2020', source: 'both' },
  { doi: '10.1371/journal.pmed.1002961', label: 'Xu 2019', source: 'main' },
  { doi: '10.1093/oxfordjournals.molbev.a025957', label: 'Yang 1998', source: 'both' },
  { doi: '10.1093/molbev/msm088', label: 'Yang 2007', source: 'both' },
];

/** The text the bulk importer parses, one identifier per line. */
export function bibliographyText(entries: BibliographyEntry[] = BIBLIOGRAPHY): string {
  return entries.map((entry) => entry.doi).join('\n');
}
