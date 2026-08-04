DELETE FROM public.bookings WHERE reference LIKE 'QA-RLS%';
DELETE FROM public.user_roles WHERE user_id = '5468c893-c10a-448a-ac26-e18a682a9ffb';
DELETE FROM public.notifications WHERE user_id IN ('071b57bf-a8f0-47d9-a58e-8e68c71e6dd4','e5aadbc8-acf2-4c29-b208-eb8e37ed1c74','5468c893-c10a-448a-ac26-e18a682a9ffb');