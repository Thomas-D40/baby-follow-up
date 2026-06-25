package com.suivibaby.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.util.UUID;

@Entity
@Table(name = "baby_caregiver")
@IdClass(BabyCaregiverId.class)
public class BabyCaregiver {

    @Id
    @Column(name = "app_user_id")
    public UUID appUserId;

    @Id
    @Column(name = "baby_id")
    public UUID babyId;

    @Column(name = "is_owner", nullable = false)
    public boolean isOwner;
}
