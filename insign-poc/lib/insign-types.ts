/**
 * Subset of the inSign OpenAPI 3.1 schema (v3.76.3) that the POC actually uses.
 * Source: docs/insign/api-docs.json on the test instance.
 */

export type InsignEventId =
  | "EXTERNBEARBEITUNGFERTIG"
  | "VORGANGABGESCHLOSSEN"
  | "SIGNATURERSTELLT"
  | "SESSIONREMINDER"
  | "EXTERNREMINDER";

export interface ConfigureSignature {
  id: string;
  role?: string;
  externRole?: string;
  displayname?: string;
  required?: boolean;
  signatureLevel?: "SES" | "AES" | "QES";
  textsearch?: string;
  posindex?: number;
  visibility?: "VISIBLE" | "HIDDEN" | "VISIBLE_BUT_DOES_NOT_PRINT" | "HIDDEN_BUT_PRINTABLE";
  vorname?: string;
  nachname?: string;
}

export interface ConfigureDocumentInput {
  id: string;
  displayname: string;
  /** PDF as base64 (no data: prefix). Pass null to upload via /configure/uploaddocument. */
  file?: string | null;
  signatures?: ConfigureSignature[];
}

export interface ConfigureSessionInput {
  displayname: string;
  foruser: string;
  documents: ConfigureDocumentInput[];

  /** Browser redirect after the session ends. */
  callbackURL?: string;

  /** Webhook URL (HTTP-GET by default, eventid + sessionid as query params). */
  serverSidecallbackURL?: string;
  serversideCallbackMethod?: "GET" | "POST" | "PUT";
  serversideCallbackContenttype?: "json" | "form";
  serversideCallbackUsername?: string;
  serversideCallbackPassword?: string;
}

export interface ConfigureDocumentsResult {
  sessionid?: string;
  accessURL?: string;
  token?: string;
  jwt?: string;
  error?: number;
  message?: string;
  trace?: string;
}

export interface StartExternUserInput {
  recipient: string;
  recipientsms?: string;
  roles?: string[];
  sendEmails?: boolean;
  sendSMS?: boolean;
  smsonly?: boolean;
  mailLanguage?: string;
  orderNumber?: number;
  userType?: "signatory" | "watcher" | "examiner";
  callbackURL?: string;
}

export interface StartExternMultiuserInput {
  sessionid?: string;
  externUsers: StartExternUserInput[];
  inOrder?: boolean;
}

export interface ExternUserResult {
  externUser?: string;
  externAccessLink?: string;
  password?: string;
  token?: string;
  orderNumber?: number;
  userType?: string;
  error?: number;
  message?: string;
}

export interface ExternMultiuserResult {
  externUsers?: ExternUserResult[];
  error?: number;
  message?: string;
  trace?: string;
}

export interface SignatureFieldStatus {
  documentID?: string;
  fieldID?: string;
  role?: string;
  externRole?: string;
  displayname?: string;
  signed?: boolean;
  mandatory?: boolean;
  signTimestamp?: string;
  deviceId?: string;
  signatureBitmap?: string;
}

export interface DocumentDataStatus {
  docid: string;
  docname?: string;
  displayname?: string;
  numberOfSignatures?: number;
  numberOfSignaturesNeeded?: number;
  numberOfSignaturesNeededDone?: number;
  hasbeensignedRequired?: boolean;
  hasbeensignedCompletely?: boolean;
  docchecksum?: string;
  docchecksumSHA512?: string;
  signaturFieldsStatusList?: SignatureFieldStatus[];
}

export interface SessionStatusResult {
  sessionid?: string;
  displayname?: string;
  sucessfullyCompleted?: boolean;
  numberOfMandatorySignatureFields?: number;
  numberOfMandatorySignatures?: number;
  numberOfSignaturesFields?: number;
  numberOfSignatures?: number;
  signaturFieldsStatusList?: SignatureFieldStatus[];
  documentData?: DocumentDataStatus[];
  modifiedTimestamp?: number;
  gdprDeclined?: boolean;
  error?: number;
  message?: string;
}

export interface CheckStatusResult {
  sessionid?: string;
  status?: string;
  processStep?: string;
  completed?: boolean;
  extern?: boolean;
  offline?: boolean;
  numberOfSignaturesNeeded?: number;
  numberOfSignaturesNeededDone?: number;
  dsgvoDeclined?: string;
  error?: number;
  message?: string;
}
