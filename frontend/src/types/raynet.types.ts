/**
 * Type definitions for Raynet API integration
 */

/**
 * Raynet lead phase information
 */
export interface RaynetLeadPhase {
  id: number;
  _permission: number;
  _entityName: string;
  code01: string;
  color: string;
  status: string;
  locked: boolean;
  sequenceNumber: number;
  rowAccess: string | null;
  extIds: string | null;
}

/**
 * Raynet owner information
 */
export interface RaynetOwner {
  id: number;
  fullName: string;
}

/**
 * Raynet contact information
 */
export interface RaynetContactInfo {
  email: string | null;
  email2: string | null;
  tel1: string | null;
  tel1Type: string | null;
  tel2: string | null;
  tel2Type: string | null;
  fax: string | null;
  www: string | null;
  otherContact: string | null;
  doNotSendMM: boolean;
}

/**
 * Raynet address information
 */
export interface RaynetAddress {
  city: string | null;
  countryName: string | null;
  countryCode: string | null;
  street: string | null;
  province: string | null;
  zipCode: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * Raynet social network contact information
 */
export interface RaynetSocialNetworkContact {
  facebook: string | null;
  googleplus: string | null;
  twitter: string | null;
  linkedin: string | null;
  pinterest: string | null;
  instagram: string | null;
  skype: string | null;
  youtube: string | null;
}

/**
 * Raynet security level
 */
export interface RaynetSecurityLevel {
  id: number;
  name: string;
}

/**
 * Raynet lead record (customer)
 */
export interface RaynetLead {
  id: number;
  code: string;
  leadDate: string;
  topic: string;
  status: string;
  leadPhase: RaynetLeadPhase;
  owner: RaynetOwner;
  priority: string;
  company: any | null;
  person: any | null;
  businessCase: any | null;
  companyName: string | null;
  lastName: string | null;
  convertDate: string | null;
  contactSource: any | null;
  category: any | null;
  firstName: string | null;
  titleBefore: string | null;
  titleAfter: string | null;
  territory: any | null;
  contactInfo: RaynetContactInfo;
  address: RaynetAddress;
  socialNetworkContact: RaynetSocialNetworkContact;
  customFields: Record<string, any>;
  "rowInfo.createdAt": string;
  "rowInfo.createdBy": string;
  "rowInfo.updatedAt": string | null;
  "rowInfo.updatedBy": string | null;
  "rowInfo.rowAccess": string | null;
  "rowInfo.rowState": string | null;
  securityLevel: RaynetSecurityLevel;
  tags: string[];
  notice: string | null;
  regNumber: string | null;
  taxNumber: string | null;
  taxNumber2: string | null;
  databox: string | null;
  leadPerson: boolean;
  inlineGdpr: any[];
  _version: number;
}
