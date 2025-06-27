-- @block
INSERT INTO Achievements (id, name, description, icon)
VALUES (1, 'Joining a route', 'Awarded for joining your first route.', '/assets/achievements/join-a-route.png');
INSERT INTO Achievements (id, name, description, icon)
VALUES (2, 'Create a route', 'Awarded for creating your first route.', '/assets/achievements/create-a-route.png');
INSERT INTO Achievements (id, name, description, icon)
VALUES (3, 'Visit 5 waypoints', 'Awarded for visiting 5 waypoints.', '/assets/achievements/visit-5-waypoints.png');
INSERT INTO Achievements (id, name, description, icon)
VALUES (4, 'Visit 100 waypoints', 'Awarded for visiting 100 waypoints.', '/assets/achievements/visit-100-waypoints.png');
INSERT INTO Achievements (id, name, description, icon)
VALUES (5, 'Completing a route', 'Awarded for completing (visiting all waypoints of) a route.', NULL);

-- @block
INSERT INTO UserAchievements (user_id, achievement_id)
VALUES (1, 1);
INSERT INTO UserAchievements (user_id, achievement_id)
VALUES (1, 2);
INSERT INTO UserAchievements (user_id, achievement_id)
VALUES (1, 4);

-- @block
-- Users created by sending POST requests in the script. 

-- -- Routes
INSERT INTO Routes(name, owner_id) VALUES
  ('Krakow Highlights', 1),
  ('Warsaw Walk', 2),
  ('Gdansk Old Town', 3);

-- Waypoints
INSERT INTO Waypoints(latitude, longitude, route_id, order_id, name) VALUES
  (50.0614, 19.9383, 1, 1, 'Wawel Castle'),
  (50.0647, 19.9450, 1, 2, 'Main Square'),
  (50.0670, 19.9120, 1, 3, 'Kazimierz'),
  (52.2297, 21.0122, 2, 1, 'Old Town'),
  (52.2300, 21.0000, 2, 2, 'Łazienki Park'),
  (54.3520, 18.6466, 3, 1, 'Neptune Fountain'),
  (54.3500, 18.6500, 3, 2, 'St. Mary Church');

-- Joined Routes
INSERT INTO JoinedRoutes(user_id, route_id) VALUES
(1, 1), (1, 3), (2, 1), (2, 2), (3, 2), (4, 3), (5, 1), (6, 3), (7, 2), (8, 1), (9, 2), (10, 1);

-- Visits
INSERT INTO Visits(user_id, waypoint_id) VALUES
  (1, 1), (1, 2), (1, 3),                 -- user1 - ukończyła trasę 1
  (1, 6), (1, 7),                         -- user1 - ukończyła trasę 3
  (2, 1), (2, 2),                         -- user2 - część trasy 1
  (2, 4), (2, 5),                         -- user2 - ukończył trasę 2
  (3, 4), (3, 5),                         -- user3 - ukończyła trasę 2
  (3, 1),                                 -- user3 - dodatkowy waypoint z innej trasy
  (4, 6),                                 -- user4 - częściowo trasa 3
  (5, 1), (5, 2),                         -- user5 - część trasy 1
  (6, 6), (6, 7),                         -- user6 - ukończył trasę 3
  (7, 4),                                 -- user7 - rozpoczęła trasę 2
  (8, 3), (8, 1),                         -- user8 - losowe punkty
  (9, 2), (9, 5),                         -- user9 - różne trasy
  (10, 1), (10, 2), (10, 3);              -- user10 - ukończyła trasę 1