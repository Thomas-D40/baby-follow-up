package com.suivibaby.model;

// Closed application enum of the medical_care resource (D15-I), lowercase in JSON like MilkType,
// StoolConsistency and VitaminType. The calendar presentation enum is a distinct one (eye_care /
// nose_care): same rows, two event types on the recap side.
public enum CareType {
    eye,
    nose
}
