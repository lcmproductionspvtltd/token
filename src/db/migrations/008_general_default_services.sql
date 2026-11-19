-- BQuee serves any kind of business, so the starter default services are general.
-- Removes the earlier salon-only starter rows (businesses that loaded them keep their copies).
DELETE FROM default_services WHERE id IN
  ('dsv01','dsv02','dsv03','dsv04','dsv05','dsv06','dsv07','dsv08','dsv09','dsv10','dsv11');

INSERT INTO default_services (id, name, category, description, duration_min, price) VALUES
  ('gsv01', 'Consultation', 'General', 'One-to-one consultation', 15, 200),
  ('gsv02', 'Follow-up visit', 'General', 'Return visit after a consultation', 10, 100),
  ('gsv03', 'Standard service', 'General', 'Our regular service', 30, 300),
  ('gsv04', 'Express service', 'Express', 'Quick service for small jobs', 10, 150),
  ('gsv05', 'Premium service', 'Premium', 'Extended service with extra care', 60, 800),
  ('gsv06', 'Inspection / check-up', 'General', 'Check and advise on what’s needed', 20, 250),
  ('gsv07', 'Enquiry', 'Desk', 'Questions and information', 5, 0),
  ('gsv08', 'Document submission', 'Desk', 'Submit or collect documents', 10, 0),
  ('gsv09', 'Payment / billing', 'Desk', 'Pay bills or settle accounts', 5, 0),
  ('gsv10', 'Pickup / delivery', 'Desk', 'Collect or drop off an item', 5, 0)
ON CONFLICT (id) DO NOTHING;
