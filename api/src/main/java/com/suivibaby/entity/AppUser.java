package com.suivibaby.entity;

import io.quarkus.security.jpa.Password;
import io.quarkus.security.jpa.Roles;
import io.quarkus.security.jpa.UserDefinition;
import io.quarkus.security.jpa.Username;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_user")
@UserDefinition
public class AppUser {

    @Id
    public UUID id;

    @Column(nullable = false, unique = true)
    @Username
    public String email;

    @Column(name = "password_hash")
    @Password
    public String passwordHash;

    @Column(name = "first_name")
    public String firstName;

    @Column(nullable = false)
    @Roles
    public String role;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}
