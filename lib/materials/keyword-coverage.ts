// Deliberately bounded vocabulary: wording coverage, not an ATS or proficiency score.
const terms: [string, string[]][] = [
 ['Python',['python']],['JavaScript',['javascript','js']],['TypeScript',['typescript','ts']],
 ['Java',['java']],['SQL',['sql']],['C++',['c++']],['C#',['c#']],['React',['react','react.js','reactjs']],
 ['Node.js',['node.js','nodejs']],['HTML',['html']],['CSS',['css']],['Git',['git']],
 ['AWS',['aws','amazon web services']],['Azure',['azure']],['Docker',['docker']],['Kubernetes',['kubernetes']],
 ['Spark',['spark','pyspark']],['Databricks',['databricks']],['Tableau',['tableau']],['Power BI',['power bi']],
 ['Excel',['excel']],['Pandas',['pandas']],['NumPy',['numpy']],['TensorFlow',['tensorflow']],['PyTorch',['pytorch']],
 ['Machine learning',['machine learning']],['Data analysis',['data analysis','data analytics']],
 ['REST APIs',['rest api','rest apis','restful']],['CI/CD',['ci/cd','continuous integration']],
 ['Unit testing',['unit test','unit tests','unit testing']],['Agile',['agile']],
];
function includes(text: string, aliases: string[]): boolean {
 return aliases.some(alias => new RegExp(`(^|[^a-z0-9_+#])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9_+#])`, 'i').test(text));
}
export function keywordCoverage(posting: string, evidence: string, resume: string, letter: string) {
 return terms.filter(([, aliases]) => includes(posting, aliases)).map(([term, aliases]) => ({
  term, evidence: includes(evidence, aliases), resume: includes(resume, aliases), letter: includes(letter, aliases),
 }));
}
