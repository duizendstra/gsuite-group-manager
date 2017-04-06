var google = require('googleapis');

function gsuiteGroupManager(mainSpecs) {
    "use strict";
    var auth;
    var service = google.admin('directory_v1');

    function getGroups() {
        var groupsSet = {
            "kind": "admin#directory#groups",
            groups: []
        };

        return new Promise(function (resolve, reject) {
            function listGroups(pageToken) {
                service.groups.list({
                    auth: auth,
                    fields: "nextPageToken, groups/name, groups/email, groups/adminCreated",
                    customer: 'my_customer',
                    maxResults: 250,
                    pageToken: pageToken
                }, function (err, response) {
                    if (err) {
                        reject('The API returned an error: ' + err);
                        return;
                    }
                    var groups = response.groups;

                    if (groups.length === 0) {
                        resolve(groupsSet);
                        return;
                    }
                    groups.forEach(function (group) {
                        groupsSet.groups.push(group);
                    });
                    if (!response.nextPageToken) {
                        resolve(groupsSet);
                        return;
                    }
                    listGroups(response.nextPageToken);
                });
            }
            listGroups();
        });
    }

    function getGroupMembers(specs) {
        var groupEmail = specs.email;
        var memberSet = {
            "kind": "admin#directory#members",
            "domainAccess": false,
            "hasNested": false,
            directMembers: [],
            directMembersIndex: {},
            allMembers: [],
            allMembersIndex: {}
        };

        function getLocalMembers(email) {
            return new Promise(function (resolve, reject) {
                var members = [];

                function listGroupMembers(pageToken) {
                    service.members.list({
                        groupKey: email,
                        auth: auth,
                        fields: "nextPageToken, members",
                        maxResults: 250,
                        pageToken: pageToken
                    }, function (err, response) {
                        if (err) {
                            reject('The groups API returned an error: ' + err);
                            return;
                        }

                        response.members = response.members || [];

                        response.members.forEach(function (member) {
                            if (member.type === "CUSTOMER") {
                                member.email = "domain";
                            }
                            member.email = member.email.toLowerCase();
                            members.push(member);
                        });

                        if (response.members.length === 0 || response.nextPageToken === undefined) {
                            members.forEach(function (member, index) {
                                member.direct = true;
                                memberSet.directMembers.push(member);
                                memberSet.directMembersIndex[member.email] = index;
                                if (memberSet.allMembersIndex[member.email] === undefined) {
                                    memberSet.allMembersIndex[member.email] = memberSet.allMembers.length;
                                    memberSet.allMembers.push(member);
                                }
                                if (member.type === "CUSTOMER") {
                                    memberSet.domainAccess = true;
                                }
                                if (member.type === "GROUP") {
                                    memberSet.hasNested = true;
                                }
                            });
                            resolve(memberSet);
                            return;
                        }
                        listGroupMembers(response.nextPageToken);
                    });
                }
                listGroupMembers();
            });
        }

        return new Promise(function (resolve, reject) {
            function getNestedGroups(response) {
                var nestedMembers = response.directMembers.filter(function (member) {
                    return member.type === "GROUP";
                });
                nestedMembers.reduce(function (promise, item) {
                    return promise
                        .then(function () {
                            return getGroupMembers({
                                email: item.email
                            }).then(function (result) {
                                item.group = result;
                                item.group.directMembers.forEach(function (member) {
                                    if (memberSet.allMembersIndex[member.email] === undefined) {
                                        member.direct = true;
                                        memberSet.allMembersIndex[member.email] = memberSet.allMembers.length;
                                        memberSet.allMembers.push(member);
                                    }
                                });
                            });
                        })
                        .catch(console.error);
                }, Promise.resolve()).then(function () {
                    resolve(memberSet);
                });
            }

            getLocalMembers(groupEmail)
                .then(function (response) {
                    if (response.hasNested) {
                        getNestedGroups(response);
                    } else {
                        resolve(response);
                    }
                }).catch(function (err) {
                    reject(err);
                });
        });
    }

    auth = mainSpecs.auth;
   
    return {
        getGroups: getGroups,
        getGroupMembers: getGroupMembers
    };
}

module.exports = gsuiteGroupManager;