export interface QualificationRuntime {
 root:string; directory:string; persist:string; origin:string; sessionSecret:string;
 artifact:{artifactHash:string;commit:string;date:string;inputs:Record<string,string>;artifacts:Record<string,string>};
 close():Promise<void>;
 restart():Promise<void>;
 sql(sql:string):Promise<{results:Record<string,unknown>[]}[]>;
}
export function createRuntime(options:{root:string;evidence:string;appPort:number;inspectorPort:number;portRange?:string;omitVariables?:string[];expectedHealthStatus?:200|503}):Promise<QualificationRuntime>;
