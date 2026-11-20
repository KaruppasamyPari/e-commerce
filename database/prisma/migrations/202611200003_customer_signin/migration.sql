ALTER TABLE Account
  MODIFY email VARCHAR(254) NULL,
  MODIFY password VARCHAR(191) NULL,
  ADD phone VARCHAR(16) NULL,
  ADD googleSubject VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  ADD UNIQUE INDEX Account_phone_key (phone),
  ADD UNIQUE INDEX Account_googleSubject_key (googleSubject);
