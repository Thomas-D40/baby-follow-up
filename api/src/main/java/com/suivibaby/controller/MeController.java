package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.mapper.UserMapper;
import com.suivibaby.model.MeResponse;
import com.suivibaby.security.CurrentUser;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/api/me")
public class MeController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    UserMapper userMapper;

    @GET
    @Authenticated
    @Produces(MediaType.APPLICATION_JSON)
    public MeResponse me() {
        AppUser currentUser = currentUserResolver.require();
        return userMapper.toMeResponse(currentUser);
    }
}
