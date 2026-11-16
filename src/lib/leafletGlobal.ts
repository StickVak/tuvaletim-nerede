import L from 'leaflet';

// leaflet.markercluster küresel L nesnesini bekler; bu modül ondan önce içe aktarılmalıdır
(window as unknown as { L: typeof L }).L = L;
