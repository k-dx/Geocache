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
VALUES (2, 1);