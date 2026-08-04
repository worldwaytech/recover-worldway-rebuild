// Top ranked flight routes served through the UP17 flight product.
// Format: "ORIGIN_IATA:Origin City>DEST_IATA:Destination City"

export type RankedRoute = {
  rank: number;
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
};

const DOMESTIC_INDIA = `DEL:Delhi>BOM:Mumbai
BOM:Mumbai>DEL:Delhi
DEL:Delhi>BLR:Bengaluru
BLR:Bengaluru>DEL:Delhi
BOM:Mumbai>BLR:Bengaluru
BLR:Bengaluru>BOM:Mumbai
DEL:Delhi>CCU:Kolkata
CCU:Kolkata>DEL:Delhi
DEL:Delhi>HYD:Hyderabad
HYD:Hyderabad>DEL:Delhi
HYD:Hyderabad>CCU:Kolkata
DEL:Delhi>MAA:Chennai
MAA:Chennai>DEL:Delhi
BOM:Mumbai>HYD:Hyderabad
HYD:Hyderabad>BOM:Mumbai
BLR:Bengaluru>HYD:Hyderabad
BOM:Mumbai>GOI:Goa
GOI:Goa>BOM:Mumbai
DEL:Delhi>GOI:Goa
BLR:Bengaluru>MAA:Chennai
BOM:Mumbai>CCU:Kolkata
CCU:Kolkata>BOM:Mumbai
DEL:Delhi>PNQ:Pune
PNQ:Pune>DEL:Delhi
DEL:Delhi>AMD:Ahmedabad
AMD:Ahmedabad>DEL:Delhi
BOM:Mumbai>AMD:Ahmedabad
DEL:Delhi>COK:Kochi
COK:Kochi>DEL:Delhi
BOM:Mumbai>COK:Kochi
BLR:Bengaluru>CCU:Kolkata
BLR:Bengaluru>GOI:Goa
DEL:Delhi>SXR:Srinagar
DEL:Delhi>IXC:Chandigarh
DEL:Delhi>JAI:Jaipur
DEL:Delhi>LKO:Lucknow
DEL:Delhi>PAT:Patna
DEL:Delhi>GAU:Guwahati
CCU:Kolkata>GAU:Guwahati
DEL:Delhi>IXB:Bagdogra
BOM:Mumbai>JAI:Jaipur
BOM:Mumbai>IDR:Indore
BLR:Bengaluru>PNQ:Pune
HYD:Hyderabad>MAA:Chennai
MAA:Chennai>CJB:Coimbatore
BLR:Bengaluru>TRV:Thiruvananthapuram
DEL:Delhi>VNS:Varanasi
DEL:Delhi>DED:Dehradun
BOM:Mumbai>UDR:Udaipur
HYD:Hyderabad>VTZ:Visakhapatnam`;

const INDIA_INTERNATIONAL = `DEL:Delhi>DXB:Dubai
BOM:Mumbai>DXB:Dubai
DEL:Delhi>LHR:London
BOM:Mumbai>LHR:London
DEL:Delhi>JFK:New York
BOM:Mumbai>JFK:New York
DEL:Delhi>SIN:Singapore
BOM:Mumbai>SIN:Singapore
DEL:Delhi>YYZ:Toronto
BOM:Mumbai>YYZ:Toronto
DEL:Delhi>YVR:Vancouver
DEL:Delhi>DOH:Doha
BOM:Mumbai>DOH:Doha
DEL:Delhi>AUH:Abu Dhabi
COK:Kochi>DXB:Dubai
BLR:Bengaluru>DXB:Dubai
MAA:Chennai>SIN:Singapore
DEL:Delhi>BKK:Bangkok
BOM:Mumbai>BKK:Bangkok
BLR:Bengaluru>LHR:London
BLR:Bengaluru>SIN:Singapore
DEL:Delhi>KUL:Kuala Lumpur
DEL:Delhi>HKG:Hong Kong
DEL:Delhi>FRA:Frankfurt
BOM:Mumbai>FRA:Frankfurt
DEL:Delhi>CDG:Paris
BOM:Mumbai>CDG:Paris
DEL:Delhi>AMS:Amsterdam
DEL:Delhi>IST:Istanbul
BOM:Mumbai>IST:Istanbul
DEL:Delhi>SFO:San Francisco
BOM:Mumbai>EWR:Newark
DEL:Delhi>ORD:Chicago
DEL:Delhi>IAD:Washington
DEL:Delhi>SYD:Sydney
BOM:Mumbai>MEL:Melbourne
DEL:Delhi>NRT:Tokyo
DEL:Delhi>ICN:Seoul
DEL:Delhi>CMB:Colombo
MAA:Chennai>CMB:Colombo
DEL:Delhi>KTM:Kathmandu
CCU:Kolkata>DAC:Dhaka
DEL:Delhi>MLE:Male
BOM:Mumbai>MLE:Male
DEL:Delhi>ZRH:Zurich
BOM:Mumbai>ZRH:Zurich
DEL:Delhi>MUC:Munich
HYD:Hyderabad>DXB:Dubai
HYD:Hyderabad>JFK:New York
MAA:Chennai>DXB:Dubai`;

const INTERNATIONAL = `LHR:London>JFK:New York
JFK:New York>LHR:London
DXB:Dubai>LHR:London
LHR:London>DXB:Dubai
SIN:Singapore>HKG:Hong Kong
HKG:Hong Kong>SIN:Singapore
LAX:Los Angeles>JFK:New York
JFK:New York>LAX:Los Angeles
CDG:Paris>JFK:New York
JFK:New York>CDG:Paris
FRA:Frankfurt>JFK:New York
YYZ:Toronto>LHR:London
LHR:London>YYZ:Toronto
YYZ:Toronto>YVR:Vancouver
YVR:Vancouver>YYZ:Toronto
SYD:Sydney>MEL:Melbourne
MEL:Melbourne>SYD:Sydney
SYD:Sydney>LAX:Los Angeles
SIN:Singapore>LHR:London
LHR:London>SIN:Singapore
DXB:Dubai>JFK:New York
JFK:New York>DXB:Dubai
NRT:Tokyo>ICN:Seoul
HND:Tokyo>SIN:Singapore
BKK:Bangkok>HKG:Hong Kong
BKK:Bangkok>SIN:Singapore
KUL:Kuala Lumpur>SIN:Singapore
PVG:Shanghai>HKG:Hong Kong
PEK:Beijing>HKG:Hong Kong
DOH:Doha>LHR:London
IST:Istanbul>LHR:London
AMS:Amsterdam>LHR:London
MAD:Madrid>LHR:London
BCN:Barcelona>LHR:London
FCO:Rome>LHR:London
CDG:Paris>LHR:London
MUC:Munich>LHR:London
ZRH:Zurich>LHR:London
CPH:Copenhagen>LHR:London
ARN:Stockholm>LHR:London
GRU:Sao Paulo>JFK:New York
EZE:Buenos Aires>MIA:Miami
MEX:Mexico City>LAX:Los Angeles
JNB:Johannesburg>LHR:London
CPT:Cape Town>LHR:London
CAI:Cairo>DXB:Dubai
NBO:Nairobi>DXB:Dubai
AKL:Auckland>SYD:Sydney
YUL:Montreal>CDG:Paris
SEA:Seattle>YVR:Vancouver`;

function parse(block: string): RankedRoute[] {
  return block
    .trim()
    .split("\n")
    .map((line, i) => {
      const [from, to] = line.split(">");
      const [origin, originCity] = from.split(":");
      const [destination, destinationCity] = to.split(":");
      return {
        rank: i + 1,
        origin: origin.trim(),
        originCity: originCity.trim(),
        destination: destination.trim(),
        destinationCity: destinationCity.trim(),
      };
    });
}

export const TOP_ROUTES = {
  domestic: parse(DOMESTIC_INDIA),
  outbound: parse(INDIA_INTERNATIONAL),
  international: parse(INTERNATIONAL),
} as const;

export type RouteGroup = keyof typeof TOP_ROUTES;

export const ROUTE_GROUP_LABELS: Record<RouteGroup, string> = {
  domestic: "Top 50 routes within India",
  outbound: "Top 50 India to abroad",
  international: "Top 50 international routes",
};
