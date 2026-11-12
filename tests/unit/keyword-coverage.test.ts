import {it,expect} from 'vitest';
import {keywordCoverage} from '../../lib/materials/keyword-coverage';
it('compares both documents separately and checks saved evidence',()=>{
 expect(keywordCoverage('Python and SQL', 'Python', 'SQL', 'Python')).toEqual([
 {term:'Python',evidence:true,resume:false,letter:true},{term:'SQL',evidence:false,resume:true,letter:false}]);
});
it('uses token boundaries and aliases without confusing JavaScript with Java or NoSQL with SQL',()=>{
 expect(keywordCoverage('Java and SQL and C++ and JavaScript','JavaScript NoSQL C++','JS C++','')).toEqual([
 {term:'JavaScript',evidence:true,resume:true,letter:false},{term:'Java',evidence:false,resume:false,letter:false},
 {term:'SQL',evidence:false,resume:false,letter:false},{term:'C++',evidence:true,resume:true,letter:false}]);
 expect(keywordCoverage('', 'Python','Python','Python')).toEqual([]);
});
